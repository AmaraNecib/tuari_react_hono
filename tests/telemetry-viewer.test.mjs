import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildZip } from '../scripts/build-release-package.mjs';
import { parseInput, emitReport, redactReport } from '../scripts/viewer/pipeline.mjs';

const event = { timestamp: '2026-01-02T01:02:03+03:00', severity: 'error', message: '</script><img src=x>', attributes: { errorId: 42, operation: 'save', durationMs: 12 } };
const line = JSON.stringify(event) + '\n';
async function folder() {
  const root = await mkdtemp(join(tmpdir(), 'viewer-test-'));
  await mkdir(join(root, '2026-01-02'));
  await writeFile(join(root, '2026-01-02/app.1.log'), line + '{"broken"');
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ product: 'Tuari', version: '1', os: 'windows', build: 'abc' }));
  return root;
}
test('folder normalization retains offsets, chunks, metadata and truncated-tail warning', async () => {
  const data = await parseInput(await folder());
  assert.equal(data.manifest.build, 'abc');
  assert.equal(data.events.length, 1);
  assert.deepEqual(data.events[0], { level: 'error', timestamp: event.timestamp, signature: event.message, operation: 'save', errorCode: 42, duration: 12, source: 'app', count: 1 });
  assert.equal(data.warnings.length, 1);
});
test('normalization accepts producer duration attributes', async () => {
  const root = await folder();
  await writeFile(join(root, '2026-01-02/app.1.log'), JSON.stringify({ ...event, attributes: { duration: 37 } }) + '\n');
  assert.equal((await parseInput(root)).events[0].duration, 37);
});
test('zip uses the folder parser; report is local and escapes hostile event strings', async () => {
  const root = await folder();
  const zip = buildZip([{ name: 'manifest.json', data: Buffer.from('{"version":"618"}') }, { name: '2026-01-02/app.1.log', data: Buffer.from(line) }]);
  const input = join(root, 'bundle.zip');
  await writeFile(input, zip);
  const data = await parseInput(input);
  assert.equal(data.manifest.version, '618');
  assert.equal(data.events[0].errorCode, 42);
  await emitReport(data, join(root, 'report.html'));
  const html = await readFile(join(root, 'report.html'), 'utf8');
  assert.ok(!html.includes('</script><img'));
  assert.ok(html.includes('src="report.js"'));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'report-data.json'), 'utf8')), redactReport(data));
  assert.ok(!(await readFile(join(root, 'report-data.json'), 'utf8')).includes('<img'));
  assert.ok(!(await readFile(join(root, 'report.js'), 'utf8')).includes('fetch('));
});
test('CLI emits fixture report and numeric error IDs ignore product names', async () => {
  const root = await folder();
  const output = join(root, 'cli.html');
  execFileSync(process.execPath, ['scripts/tuari-viewer.mjs', fileURLToPath(new URL('./fixtures/viewer/', import.meta.url)), '-o', output]);
  assert.equal(JSON.parse(await readFile(join(root, 'report-data.json'), 'utf8')).events[0].errorCode, 42);
  await writeFile(join(root, '2026-01-02/app.1.log'), JSON.stringify({ ...event, attributes: {}, errorCode: 'NEWPRODUCT-0000002A' }) + '\n');
  assert.equal((await parseInput(root)).events[0].errorCode, 42);
});
test('emission redacts raw messages, operation values, attributes and unknown manifest fields', async () => {
  const root = await folder();
  await writeFile(join(root, '2026-01-02/app.1.log'), JSON.stringify({ ...event, message: 'SECRET_TOKEN C:\\customer', attributes: { errorId: 42, operation: 'SECRET_TOKEN', userId: 'SECRET_TOKEN', headers: 'SECRET_TOKEN', sqlBindings: 'SECRET_TOKEN' } }) + '\n');
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ version: '1.2.3', os: 'windows', build: 'abc', userId: 'SECRET_TOKEN', product: 'SECRET_TOKEN' }));
  const parsed = await parseInput(root);
  assert.ok(parsed.events[0].signature.includes('SECRET_TOKEN'));
  await emitReport(parsed, join(root, 'redacted.html'));
  for (const name of ['redacted.html', 'report-data.json', 'report.js']) assert.ok(!(await readFile(join(root, name), 'utf8')).includes('SECRET_TOKEN'));
  assert.equal(JSON.parse(await readFile(join(root, 'report-data.json'), 'utf8')).events[0].errorCode, 42);
});
test('output collisions preserve existing files and roll back only this attempt so retry succeeds', async () => {
  const data = await parseInput(await folder());
  for (const collision of ['report.html', 'report.js', 'report-data.json', 'report.css']) {
    const root = await mkdtemp(join(tmpdir(), 'viewer-collision-'));
    const existing = join(root, collision);
    await writeFile(existing, 'original sidecar content');
    await assert.rejects(emitReport(data, join(root, 'report.html')), { code: 'EEXIST' });
    assert.equal(await readFile(existing, 'utf8'), 'original sidecar content');
    for (const name of ['report.html', 'report.js', 'report-data.json', 'report.css']) {
      if (name !== collision) await assert.rejects(lstat(join(root, name)), { code: 'ENOENT' });
    }
    await rename(existing, join(root, 'preserved-original'));
    await emitReport(data, join(root, 'report.html'));
    assert.ok((await readFile(join(root, 'report.html'), 'utf8')).startsWith('<!doctype html>'));
    assert.deepEqual(JSON.parse(await readFile(join(root, 'report-data.json'), 'utf8')), redactReport(data));
    assert.equal(await readFile(join(root, 'preserved-original'), 'utf8'), 'original sidecar content');
  }
});
test('CRC corruption and oversized lines are rejected', async () => {
  const root = await folder();
  const zip = buildZip([{ name: 'manifest.json', data: Buffer.from('{}') }]);
  zip[30 + 'manifest.json'.length] ^= 1;
  const input = join(root, 'corrupt.zip');
  await writeFile(input, zip);
  await assert.rejects(parseInput(input), /ZIP/);
  await writeFile(join(root, '2026-01-02/app.1.log'), 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(parseInput(root), /Oversized line/);
});
test('malformed complete lines fail, unlike an incomplete final line', async () => {
  const root = await folder();
  await writeFile(join(root, '2026-01-02/app.1.log'), 'broken\n');
  await assert.rejects(parseInput(root), /Malformed/);
});
test('unsafe archive paths and truncated archives fail', async () => {
  const root = await folder();
  const input = join(root, 'bad.zip');
  await writeFile(input, buildZip([{ name: '../outside', data: Buffer.from('x') }]));
  await assert.rejects(parseInput(input), /Unsafe/);
  await writeFile(input, Buffer.from('PK'));
  await assert.rejects(parseInput(input), /ZIP/);
});
