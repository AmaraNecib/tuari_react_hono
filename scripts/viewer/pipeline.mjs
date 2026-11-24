import { open, lstat, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';

export const PRODUCT_PREFIX = 'TUARI';
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_ENTRIES = 1024;
const MAX_EVENTS = 100000;
const dayName = /^\d{4}-\d{2}-\d{2}$/;
const chunkName = /^(app|api|desktop)(?:\.\d{1,10})?\.log$/;
function safeName(name) {
  if (name === 'manifest.json' || name === 'config.json') return true;
  const parts = name.split('/');
  return parts.length === 2 && dayName.test(parts[0]) && chunkName.test(parts[1]);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function boundedRead(path, limit) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error('Unsafe or oversized input');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.dev !== before.dev || actual.ino !== before.ino) throw new Error('Unsafe input replacement');
    const bytes = Buffer.alloc(Math.min(limit + 1, actual.size + 1));
    let size = 0;
    while (size < bytes.length) {
      const result = await file.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > limit || size > actual.size) throw new Error('Oversized or changing input');
    return bytes.subarray(0, size);
  } finally { await file.close(); }
}
// Only allowlisted regular entries reach a fresh private directory. Central and local
// records must agree; ZIP64, encryption, links and descriptor streams fail closed.
async function extract(bytes, root) {
  const fail = () => { throw new Error('Unsafe or malformed ZIP'); };
  if (bytes.length < 22) fail();
  const end = bytes.length - 22;
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 20) !== 0 || bytes.readUInt32LE(end + 4) !== 0) fail();
  const count = bytes.readUInt16LE(end + 10);
  if (count > MAX_ENTRIES || bytes.readUInt16LE(end + 8) !== count) fail();
  let pos = bytes.readUInt32LE(end + 16);
  if (pos + bytes.readUInt32LE(end + 12) !== end) fail();
  const names = new Set();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    const crc = bytes.readUInt32LE(pos + 16), packed = bytes.readUInt32LE(pos + 20), size = bytes.readUInt32LE(pos + 24);
    const length = bytes.readUInt16LE(pos + 28), extra = bytes.readUInt16LE(pos + 30), comment = bytes.readUInt16LE(pos + 32);
    const local = bytes.readUInt32LE(pos + 42);
    const mode = bytes.readUInt32LE(pos + 38) >>> 16;
    if ((flags & ~0x800) || ![0, 8].includes(method) || size > MAX_FILE || total + size > MAX_BYTES || (mode && (mode & 0xf000) !== 0x8000) || bytes.readUInt16LE(pos + 34)) fail();
    if (pos + 46 + length + extra + comment > end || local + 30 > pos) fail();
    const name = bytes.subarray(pos + 46, pos + 46 + length).toString('utf8');
    if (!safeName(name) || names.has(name)) fail();
    names.add(name);
    if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== packed || bytes.readUInt32LE(local + 22) !== size || bytes.readUInt16LE(local + 26) !== length) fail();
    const start = local + 30 + length + bytes.readUInt16LE(local + 28);
    if (start + packed > pos || bytes.subarray(local + 30, local + 30 + length).toString('utf8') !== name) fail();
    const compressed = bytes.subarray(start, start + packed);
    let data;
    try { data = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) }); }
    catch { fail(); }
    if (data.length !== size || crc32(data) !== crc) fail();
    total += size;
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), data, { flag: 'wx' });
    pos += 46 + length + extra + comment;
  }
  if (pos !== end) fail();
}
function normalize(value, source) {
  const timestamp = value?.timestamp;
  const level = value?.severity ?? value?.level;
  if (typeof timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) || !['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level)) throw new Error('Malformed event');
  const attrs = value.attributes ?? {};
  const rawCode = attrs.errorId ?? value.errorCode;
  const code = typeof rawCode === 'number' ? rawCode : typeof rawCode === 'string' ? Number.parseInt(rawCode.match(/^[A-Za-z][A-Za-z0-9_-]*-([0-9a-f]{8})$/i)?.[1] ?? '', 16) : null;
  const duration = attrs.durationMs ?? value.durationMs;
  return { level, timestamp, signature: typeof value.signature === 'string' ? value.signature : typeof value.message === 'string' ? value.message : '', operation: typeof attrs.operation === 'string' ? attrs.operation : null, errorCode: Number.isSafeInteger(code) && code >= 0 && code <= 0xffffffff ? code : null, duration: Number.isFinite(duration) && duration >= 0 ? duration : null, source, count: Number.isSafeInteger(value.count) && value.count > 0 ? value.count : 1 };
}
async function parseFolder(root) {
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new Error('Unsafe logs folder');
  const result = { schemaVersion: 1, productPrefix: PRODUCT_PREFIX, manifest: null, events: [], warnings: [] };
  let total = 0, files = 0;
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length > 4096) throw new Error('Too many folder entries');
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'manifest.json') {
      result.manifest = JSON.parse((await boundedRead(join(root, entry.name), 65536)).toString('utf8'));
      if (!result.manifest || typeof result.manifest !== 'object' || Array.isArray(result.manifest)) throw new Error('Malformed manifest');
    }
    if (!dayName.test(entry.name)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Unsafe day folder');
    const day = join(root, entry.name);
    const chunks = await readdir(day, { withFileTypes: true });
    if (chunks.length > 4096) throw new Error('Too many chunks');
    for (const chunk of chunks.sort((a, b) => a.name.localeCompare(b.name))) {
      const match = chunk.name.match(chunkName);
      if (!match) continue;
      if (++files > MAX_ENTRIES) throw new Error('Too many chunks');
      const data = await boundedRead(join(day, chunk.name), MAX_FILE);
      total += data.length;
      if (total > MAX_BYTES) throw new Error('Oversized logs');
      const lines = data.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        if (Buffer.byteLength(lines[i]) > 1024 * 1024) throw new Error('Oversized line');
        let value;
        try { value = JSON.parse(lines[i]); } catch {
          if (i === lines.length - 1) { result.warnings.push(`${entry.name}/${chunk.name}: truncated trailing line`); continue; }
          throw new Error(`Malformed JSONL: ${entry.name}/${chunk.name}:${i + 1}`);
        }
        if (result.events.length >= MAX_EVENTS) throw new Error('Too many events');
        result.events.push(normalize(value, match[1]));
      }
    }
  }
  result.events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return result;
}
export async function parseInput(input) {
  const path = resolve(input);
  if ((await lstat(path)).isDirectory()) return parseFolder(path);
  const bytes = await boundedRead(path, MAX_BYTES);
  const temp = await mkdtemp(join(tmpdir(), 'tuari-viewer-'));
  try { await extract(bytes, temp); return await parseFolder(temp); }
  finally { await rm(temp, { recursive: true, force: true }); }
}
// JSON remains reusable independently. The inert HTML copy avoids file:// fetch
// restrictions and keeps the reusable script free of bundle-specific content.
export function redactReport(data) {
  const manifest = {};
  const input = data.manifest ?? {};
  for (const key of ['version', 'build']) {
    const value = input[key];
    if (typeof value === 'string' && (key === 'version' ? /^\d+(?:\.\d+)*(?:-[A-Za-z0-9.]+)?$/ : /^(?:[a-f0-9]{3,64}|unknown)$/i).test(value)) manifest[key] = value;
  }
  if (typeof input.product === 'string' && input.product.toUpperCase() === PRODUCT_PREFIX) manifest.product = input.product;
  if (['windows', 'linux', 'macos', 'android', 'ios'].includes(input.os)) manifest.os = input.os;
  for (const key of ['createdAt', 'firstEventAt', 'lastEventAt']) {
    if (typeof input[key] === 'string' && /^\d{4}-\d\d-\d\dT[0-9:.+-]+Z?$/.test(input[key]) && Number.isFinite(Date.parse(input[key]))) manifest[key] = input[key];
  }
  return { ...data, manifest: data.manifest ? manifest : null, events: data.events.map(event => ({ ...event, signature: ['error', 'ui', 'crash', 'lifecycle'].includes(event.signature) ? event.signature : event.errorCode !== null ? `error:${event.errorCode}` : event.level, operation: null })) };
}
export async function emitReport(data, destination) {
  const json = JSON.stringify(redactReport(data));
  const escaped = json.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'"><title>Diagnostics report</title><h1>Diagnostics report</h1><pre id="report"></pre><div id="report-data" hidden>' + escaped + '</div><script src="report.js"></script></html>\n';
  const root = dirname(resolve(destination));
  await mkdir(root, { recursive: true });
  // Refuse collisions, including sidecars belonging to another report.
  const handles = [];
  try {
    for (const path of [destination, join(root, 'report.js'), join(root, 'report-data.json')]) handles.push(await open(path, 'wx'));
    await handles[0].writeFile(html);
    await handles[1].writeFile("'use strict';\nconst data = JSON.parse(document.getElementById('report-data').textContent);\ndocument.getElementById('report').textContent = JSON.stringify(data, null, 2);\n");
    await handles[2].writeFile(json + '\n');
  } finally { await Promise.all(handles.map(file => file.close())); }
}
