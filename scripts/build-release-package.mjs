// build-release-package.mjs — Build the full update package artifact set for a release
//
// Usage:
//   node scripts/build-release-package.mjs \
//     --version 0.5.0 \
//     --channel stable \
//     --build-number 42 \
//     --output-dir ./release \
//     --web-dist ./apps/web/dist \
//     --api-dist ./apps/api/dist \
//     --desktop-binary ./apps/desktop/src-tauri/target/release/tuari.exe \
//     --private-key ./scripts/dev-update-keys/dev-update-private-key.pem \
//     --public-key ./scripts/dev-update-keys/dev-update-public-key.pem \
//     --min-supported-version 0.4.0
//
// Produces:
//   - tuari-<version>-<channel>.update   (signed update package)
//   - updates.json                         (update metadata)
//   - CHANGELOG-<version>.md               (release notes)

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { canonicalStringify } from './sign-update.mjs';

// ─── Exports for testing ────────────────────────────────────────────────────

/**
 * Extract files from a ZIP buffer. Returns Map<path, Buffer>.
 * Supports deflate (method 8) and stored (method 0).
 */
export function readZipBuffer(zipData) {
  const map = new Map();
  let pos = 0;

  while (pos < zipData.length - 4) {
    const sig = zipData.readUInt32LE(pos);
    if (sig === 0x02014b50) break;
    if (sig !== 0x04034b50) { pos++; continue; }

    const compMethod = zipData.readUInt16LE(pos + 8);
    const compSize = zipData.readUInt32LE(pos + 18);
    const nameLen = zipData.readUInt16LE(pos + 26);
    const extraLen = zipData.readUInt16LE(pos + 28);
    const name = zipData.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    let data = zipData.slice(dataStart, dataStart + compSize);

    if (compMethod === 8 && data.length > 0) {
      try { data = inflateRawSync(data); } catch (_) { /* leave as-is */ }
    }

    map.set(name, data);
    pos = dataStart + compSize;
  }

  return map;
}

// ─── CRC-32 Implementation ──────────────────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c = crcTable[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ─── Deterministic ZIP Creator ──────────────────────────────────────────────

// Fixed DOS timestamp: 2026-01-01 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/**
 * Build a deterministic ZIP archive buffer.
 * Uses deflate level 6 for reproducible builds (per ADR-UPD-003).
 * Uses fixed timestamps to eliminate non-determinism from file modification times.
 */
export function buildZip(entries) {
  const LOCAL_HEADER_BASE = 30;
  const CENTRAL_BASE = 46;

  const localHeaders = [];
  const compressedData = [];
  const centralEntries = [];

  for (const entry of entries) {
    const nameBin = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const comp = deflateRawSync(data, { level: 6 });

    // local file header
    const hdr = Buffer.alloc(LOCAL_HEADER_BASE + nameBin.length);
    hdr.writeUInt32LE(0x04034b50, 0);
    hdr.writeUInt16LE(20, 4);        // version needed
    hdr.writeUInt16LE(0, 6);         // flags
    hdr.writeUInt16LE(8, 8);         // compression: deflate
    hdr.writeUInt16LE(DOS_TIME, 10);
    hdr.writeUInt16LE(DOS_DATE, 12);
    hdr.writeUInt32LE(crc, 14);
    hdr.writeUInt32LE(comp.length, 18);
    hdr.writeUInt32LE(data.length, 22);
    hdr.writeUInt16LE(nameBin.length, 26);
    hdr.writeUInt16LE(0, 28);
    nameBin.copy(hdr, 30);

    localHeaders.push(hdr);
    compressedData.push(comp);
  }

  // Calculate offsets and build central directory
  let offset = 0;
  for (let i = 0; i < entries.length; i++) {
    const nameBin = Buffer.from(entries[i].name, 'utf8');
    const data = entries[i].data;
    const comp = compressedData[i];
    const crc = crc32(data);

    const cent = Buffer.alloc(CENTRAL_BASE + nameBin.length);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);       // version made by
    cent.writeUInt16LE(20, 6);       // version needed
    cent.writeUInt16LE(0, 8);
    cent.writeUInt16LE(8, 10);       // compression: deflate
    cent.writeUInt16LE(DOS_TIME, 12);
    cent.writeUInt16LE(DOS_DATE, 14);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(comp.length, 20);
    cent.writeUInt32LE(data.length, 24);
    cent.writeUInt16LE(nameBin.length, 28);
    cent.writeUInt16LE(0, 30);
    cent.writeUInt16LE(0, 32);
    cent.writeUInt16LE(0, 34);
    cent.writeUInt16LE(0, 36);
    cent.writeUInt32LE(0, 38);
    cent.writeUInt32LE(offset, 42);
    nameBin.copy(cent, 46);

    centralEntries.push(cent);
    offset += localHeaders[i].length + comp.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralEntries.reduce((s, e) => s + e.length, 0);
  const eocdOffset = centralDirOffset + centralDirSize;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  // Assemble
  const buf = Buffer.alloc(eocdOffset + 22);
  let pos = 0;
  for (let i = 0; i < entries.length; i++) {
    localHeaders[i].copy(buf, pos);
    pos += localHeaders[i].length;
    compressedData[i].copy(buf, pos);
    pos += compressedData[i].length;
  }
  for (const ce of centralEntries) {
    ce.copy(buf, pos);
    pos += ce.length;
  }
  eocd.copy(buf, pos);

  return buf;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const scriptDir = dirname(fileURLToPath(import.meta.url));

/**
 * Walk a directory tree, returning relative paths.
 */
async function walkDir(dirPath, baseDir) {
  const entries = [];
  const dir = await readdir(dirPath, { withFileTypes: true });
  for (const entry of dir) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath, baseDir);
      entries.push(...sub);
    } else {
      entries.push({
        fullPath,
        relativePath: relative(baseDir || dirPath, fullPath).replace(/\\/g, '/'),
      });
    }
  }
  return entries;
}

// ─── CLI (only runs when executed directly) ──────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].replace(/\\/g, '/').endsWith('build-release-package.mjs')
);

if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage: node scripts/build-release-package.mjs [options]

Build the full update package artifact set for a release.

Options:
  --version <ver>                Package version (semver, required)
  --channel <name>               Release channel (stable/beta/nightly, required)
  --build-number <num>           CI build number (required)
  --output-dir <dir>             Output directory for artifacts (required)
  --web-dist <dir>               Path to built frontend (apps/web/dist, required)
  --api-dist <dir>               Path to built API (apps/api/dist, required)
  --desktop-binary <path>        Path to desktop binary (optional)
  --private-key <path>           Ed25519 private key PEM file (required)
  --public-key <path>            Ed25519 public key PEM file (required)
  --min-supported-version <ver>  Minimum app version that can apply this update (required)
  --download-url <url>           Download URL for the update package (optional)
  --skip-changelog               Skip changelog generation
  --skip-validation              Skip post-build validation
  --help                         Show this help
`);
    process.exit(0);
  }

  function getArg(name) {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  }

  const cli = {
    version: getArg('--version'),
    channel: getArg('--channel'),
    buildNumber: getArg('--build-number'),
    outputDir: getArg('--output-dir'),
    webDist: getArg('--web-dist'),
    apiDist: getArg('--api-dist'),
    desktopBinary: getArg('--desktop-binary'),
    privateKey: getArg('--private-key'),
    publicKey: getArg('--public-key'),
    minSupportedVersion: getArg('--min-supported-version'),
    downloadUrl: getArg('--download-url'),
    skipChangelog: argv.includes('--skip-changelog'),
    skipValidation: argv.includes('--skip-validation'),
  };

  const required = ['version', 'channel', 'buildNumber', 'outputDir', 'webDist', 'apiDist', 'privateKey', 'publicKey', 'minSupportedVersion'];
  const missing = required.filter(k => !cli[k]);
  if (missing.length > 0) {
    console.error(`Error: Missing required arguments: ${missing.map(k => '--' + k.replace(/([A-Z])/g, '-$1').toLowerCase()).join(', ')}`);
    process.exit(1);
  }

  for (const key of ['webDist', 'apiDist', 'privateKey', 'publicKey']) {
    if (cli[key] && !existsSync(resolve(cli[key]))) {
      console.error(`Error: --${key.replace(/([A-Z])/g, '-$1').toLowerCase()} path does not exist: ${cli[key]}`);
      process.exit(1);
    }
  }
  if (cli.desktopBinary && !existsSync(resolve(cli.desktopBinary))) {
    console.error(`Error: --desktop-binary path does not exist: ${cli.desktopBinary}`);
    process.exit(1);
  }

  // ─── Run ──────────────────────────────────────────────────────────────────
  main(cli).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(cli) {
  const outDir = resolve(cli.outputDir);
  await mkdir(outDir, { recursive: true });

  const tmpDir = join(outDir, `.tmp-build-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  console.log(`Building release package v${cli.version} (${cli.channel}, build ${cli.buildNumber})`);
  console.log(`Output: ${outDir}`);
  console.log('');

  try {
    // ──────── Step 1: Assemble update package ────────
    console.log('Step 1: Assembling update package...');

    const fileEntries = [];

    // Web dist
    if (existsSync(resolve(cli.webDist))) {
      const webFiles = await walkDir(resolve(cli.webDist));
      for (const f of webFiles) {
        fileEntries.push({ fullPath: f.fullPath, archivePath: `web/dist/${f.relativePath}` });
      }
      console.log(`  Found ${webFiles.length} web files`);
    }

    // API dist
    if (existsSync(resolve(cli.apiDist))) {
      const apiFiles = await walkDir(resolve(cli.apiDist));
      for (const f of apiFiles) {
        fileEntries.push({ fullPath: f.fullPath, archivePath: `api/dist/${f.relativePath}` });
      }
      console.log(`  Found ${apiFiles.length} API files`);
    }

    // Desktop binary (optional)
    if (cli.desktopBinary) {
      const binName = cli.desktopBinary.split(/[/\\]+/).pop();
      fileEntries.push({ fullPath: resolve(cli.desktopBinary), archivePath: `bin/${binName}` });
      console.log(`  Desktop binary: ${binName}`);
    }

    if (fileEntries.length === 0) {
      throw new Error('No files found to package');
    }

    // Read all files and compute hashes
    const archiveFiles = [];
    for (const fe of fileEntries) {
      const data = await readFile(fe.fullPath);
      const hash = createHash('sha256').update(data).digest('hex');
      archiveFiles.push({ path: fe.archivePath, sha256: hash, size: data.length, data });
    }

    // Build manifest object (without signature)
    // Format aligned with update.rs::parse_update_manifest
    // `checksum` is left as an empty string by design — the per-file `hash` fields are
    // the integrity source verified by update.rs, and the SHA-256 of the entire
    // .update package is published in updates.json (updatePackageSha256). Baking the
    // .update's own hash into a field that lives inside the .update would be circular.
    const manifest = {
      manifestVersion: 1,
      version: cli.version,
      platform: 'windows-x86_64',
      minSupportedVersion: cli.minSupportedVersion,
      checksum: '',
      files: archiveFiles.map(f => ({ path: f.path, hash: f.sha256, size: f.size })),
    };

    // Write temp manifest for signing
    const tmpManifest = join(tmpDir, 'manifest.json');
    await writeFile(tmpManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    // Sign via sign-update.mjs
    const signedPath = join(tmpDir, 'manifest.signed');
    const signProc = spawnSync(process.execPath, [
      join(scriptDir, 'sign-update.mjs'),
      '--manifest', tmpManifest,
      '--private-key', resolve(cli.privateKey),
      '--output', signedPath,
    ], { encoding: 'utf8', cwd: scriptDir });

    if (signProc.status !== 0) {
      const msg = signProc.stderr || signProc.stdout || `exit ${signProc.status}`;
      throw new Error(`sign-update.mjs failed: ${msg.trim()}`);
    }

    // Extract signature from signed output
    const signedText = (await readFile(signedPath, 'utf8')).trim();
    const dot = signedText.lastIndexOf('.');
    if (dot < 1 || dot >= signedText.length - 1) {
      throw new Error('Invalid signed manifest format');
    }
    manifest.signature = signedText.slice(dot + 1);

    // Write final manifest.json
    const finalManifest = JSON.stringify(manifest, null, 2) + '\n';

    // Build ZIP archive
    const zipEntries = [
      { name: 'manifest.json', data: Buffer.from(finalManifest, 'utf8') },
      ...archiveFiles.map(f => ({ name: f.path, data: f.data })),
    ];
    const zipBuf = buildZip(zipEntries);

    // Write .update file
    const updateName = `tuari-${cli.version}-${cli.channel}.update`;
    const updatePath = join(outDir, updateName);
    await writeFile(updatePath, zipBuf);
    console.log(`  Created ${updateName} (${(zipBuf.length / 1024 / 1024).toFixed(2)} MB)`);

    // ──────── Step 2: Generate updates.json ────────
    console.log('Step 2: Generating updates.json...');

    const genArgs = [
      join(scriptDir, 'generate-update-metadata.mjs'),
      '--version', cli.version,
      '--channel', cli.channel,
      '--build-number', cli.buildNumber,
      '--min-supported-version', cli.minSupportedVersion,
      '--update-package', updatePath,
      '--output-dir', outDir,
    ];
    if (cli.downloadUrl) genArgs.push('--download-url', cli.downloadUrl);

    const genProc = spawnSync(process.execPath, genArgs, { encoding: 'utf8', cwd: scriptDir });
    if (genProc.status !== 0) {
      const msg = genProc.stderr || genProc.stdout || `exit ${genProc.status}`;
      throw new Error(`generate-update-metadata.mjs failed: ${msg.trim()}`);
    }
    console.log(`  ${genProc.stdout.trim()}`);

    // ──────── Step 3: Generate changelog ────────
    if (!cli.skipChangelog) {
      console.log('Step 3: Generating changelog...');
      const changelog = await generateChangelog(cli.version);
      const changelogPath = join(outDir, `CHANGELOG-${cli.version}.md`);
      await writeFile(changelogPath, changelog, 'utf8');
      console.log(`  Generated CHANGELOG-${cli.version}.md`);
    } else {
      console.log('Step 3: Skipping changelog (--skip-changelog)');
    }

    // ──────── Validation ────────
    if (!cli.skipValidation) {
      console.log('');
      console.log('Validating update package...');
      await validatePackage(updatePath, cli.publicKey);
    } else {
      console.log('');
      console.log('Skipping validation (--skip-validation)');
    }

    // Cleanup
    await rm(tmpDir, { recursive: true, force: true });

    console.log('');
    console.log('✓ Release package build complete!');
    console.log(`  ${updateName}`);
    console.log(`  updates.json`);
    if (!cli.skipChangelog) console.log(`  CHANGELOG-${cli.version}.md`);

  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

// ─── Changelog ───────────────────────────────────────────────────────────────

async function generateChangelog(version) {
  // Use spawnSync with array args (no shell) to avoid shell-injection from a
  // tag name like `v1.0.0; rm -rf /`. Git tag names are user-controlled.
  let lastTag = '';
  try {
    const describeProc = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
      encoding: 'utf8', cwd: scriptDir, shell: false,
    });
    if (describeProc.status === 0) {
      lastTag = describeProc.stdout.trim();
    }
  } catch (_) { /* no tags */ }

  const range = lastTag ? `${lastTag}..HEAD` : '--all';
  let logText = '';
  try {
    const logProc = spawnSync('git', ['log', range, '--oneline', '--no-decorate'], {
      encoding: 'utf8', cwd: scriptDir, shell: false, maxBuffer: 10 * 1024 * 1024,
    });
    if (logProc.status !== 0) {
      throw new Error(logProc.stderr || `git log exited with ${logProc.status}`);
    }
    logText = logProc.stdout.trim();
  } catch (err) {
    console.warn(`  Warning: git log unavailable: ${err.message}`);
    return `# Changelog\n\n## ${version}\n\n- No changelog available\n\n*Release date: ${new Date().toISOString().split('T')[0]}*\n`;
  }

  const lines = logText ? logText.split('\n') : [];
  let md = `# Changelog\n\n## ${version}\n\n`;
  if (lines.length === 0) {
    md += '- Initial release\n';
  } else {
    for (const line of lines) {
      const m = line.match(/^([a-f0-9]+)\s+(.+)$/);
      if (m) {
        const msg = m[2].charAt(0).toUpperCase() + m[2].slice(1);
        md += `- ${msg} (${m[1]})\n`;
      }
    }
  }
  md += `\n*Release date: ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export async function validatePackage(updatePath, publicKeyPath) {
  const zipData = await readFile(updatePath);
  const extracted = readZipBuffer(zipData);

  // Check manifest.json exists
  if (!extracted.has('manifest.json')) {
    throw new Error('manifest.json not found in update package');
  }

  // Parse manifest
  let manifestInZip;
  try {
    manifestInZip = JSON.parse(extracted.get('manifest.json').toString('utf8'));
  } catch (err) {
    throw new Error(`manifest.json is not valid JSON: ${err.message}`);
  }

  // Verify the manifest signature
  const sig = manifestInZip.signature;
  if (!sig) {
    throw new Error('manifest.json has no signature field');
  }

  // Rebuild canonical JSON without signature field
  const verifyObj = { ...manifestInZip };
  delete verifyObj.signature;
  const canonical = canonicalStringify(verifyObj);
  const canonicalB64 = Buffer.from(canonical, 'utf8').toString('base64url');

  // Write temp signed manifest and call verify-signed-manifest.mjs
  const tmpDir = dirname(updatePath);
  const tmpVerifyFile = join(tmpDir, `.tmp-verify-${Date.now()}.signed`);
  try {
    await writeFile(tmpVerifyFile, `${canonicalB64}.${sig}`, 'utf8');

    const vfyProc = spawnSync(process.execPath, [
      join(scriptDir, 'verify-signed-manifest.mjs'),
      '--public-key', resolve(publicKeyPath),
      '--manifest', tmpVerifyFile,
    ], { encoding: 'utf8', cwd: scriptDir });

    if (vfyProc.status !== 0) {
      const msg = vfyProc.stderr || vfyProc.stdout || `exit ${vfyProc.status}`;
      throw new Error(`Signature verification failed: ${msg.trim()}`);
    }
    console.log('  ✓ Manifest signature is valid');
  } finally {
    await rm(tmpVerifyFile, { force: true }).catch(() => {});
  }

  // Verify every file in manifest exists in ZIP with matching hash
  const manifestFiles = manifestInZip.files || [];
  let ok = true;
  for (const mf of manifestFiles) {
    const data = extracted.get(mf.path);
    if (!data) {
      console.error(`  FAIL: File "${mf.path}" from manifest not found in ZIP`);
      ok = false;
      continue;
    }
    const actualHash = createHash('sha256').update(data).digest('hex');
    if (actualHash !== mf.hash) {
      console.error(`  FAIL: Hash mismatch for "${mf.path}"`);
      console.error(`    Expected: ${mf.hash}`);
      console.error(`    Actual:   ${actualHash}`);
      ok = false;
    }
  }

  if (!ok) throw new Error('File integrity check failed');
  console.log('  ✓ All files present with correct hashes');
  console.log('  ✓ Update package validation passed');
}
