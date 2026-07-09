// verify-release-assets.test.mjs — Tests for release asset verification script
//
// Run: node --test tests/verify-release-assets.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const scriptDir = fileURLToPath(new URL('../scripts', import.meta.url));

function runScript(script, args) {
  const fullPath = join(scriptDir, script);
  const result = spawnSync(process.execPath, [fullPath, ...args], {
    encoding: 'utf8',
    cwd: scriptDir,
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Create a zip archive using system utility (PowerShell on Windows, zip/tar on Unix).
 * This is only needed for tests that simulate release artifacts.
 */
async function createZip(zipPath, sourceDir, filenames) {
  // PowerShell Compress-Archive works reliably on Windows
  const items = filenames.map(f => `'${join(sourceDir, f).replace(/'/g, "''")}'`).join(',');
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path @(${items}) -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'pipe', shell: true, timeout: 30000 }
  );
}

// ─── Tests ────────────────────────────────────────────────────────

test('verify-release-assets exits with non-zero when --artifacts is missing', () => {
  const result = runScript('verify-release-assets.mjs', []);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when --artifacts is missing');
  assert.match(result.stderr, /--artifacts/i, 'should mention the missing argument');
});

test('verify-release-assets exits with non-zero when artifacts directory does not exist', () => {
  const result = runScript('verify-release-assets.mjs', ['--artifacts', '/nonexistent-test-dir/']);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when dir does not exist');
});

test('verify-release-assets exits with non-zero when portable zip is missing', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-test-'));
  await mkdir(join(tmp, 'artifacts'), { recursive: true });
  const result = runScript('verify-release-assets.mjs', ['--artifacts', join(tmp, 'artifacts')]);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when portable zip is missing');
  assert.match(result.stderr, /portable.*zip/i, 'should mention missing portable zip');
});

test('verify-release-assets exits with non-zero when portable zip does not contain Tuari.exe', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-test-'));
  const artifactsDir = join(tmp, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const emptyDir = join(tmp, 'empty');
  await mkdir(emptyDir, { recursive: true });
  await writeFile(join(emptyDir, 'README.txt'), 'not the app');

  const zipPath = join(artifactsDir, 'tuari-0.5.0-stable-portable.zip');
  await createZip(zipPath, emptyDir, ['README.txt']);

  const result = runScript('verify-release-assets.mjs', ['--artifacts', artifactsDir]);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when Tuari.exe is missing');
  assert.match(result.stderr, /Tuari\.exe/i, 'should mention missing Tuari.exe');
});

test('verify-release-assets exits with non-zero when update package is missing', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-test-'));
  const artifactsDir = join(tmp, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const appDir = join(tmp, 'app');
  await mkdir(appDir, { recursive: true });
  await writeFile(join(appDir, 'Tuari.exe'), 'fake binary content');

  const zipPath = join(artifactsDir, 'tuari-0.5.0-stable-portable.zip');
  await createZip(zipPath, appDir, ['Tuari.exe']);

  const result = runScript('verify-release-assets.mjs', ['--artifacts', artifactsDir]);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when .update file is missing');
  assert.match(result.stderr, /update/i, 'should mention missing update file');
});

test('verify-release-assets passes with valid artifacts', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-test-'));
  const artifactsDir = join(tmp, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const appDir = join(tmp, 'app');
  await mkdir(appDir, { recursive: true });
  await writeFile(join(appDir, 'Tuari.exe'), 'fake binary content');

  const zipPath = join(artifactsDir, 'tuari-0.5.0-stable-portable.zip');
  await createZip(zipPath, appDir, ['Tuari.exe']);

  // Create a valid signed update manifest
  const crypto = await import('node:crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const manifest = {
    version: '0.5.0',
    platform: 'windows-x86_64',
    minSupportedVersion: '0.1.0',
    checksum: 'abc123',
    files: [{ path: 'Tuari.exe', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', size: 99999 }]
  };

  // Canonical stringify
  function canonicalStringify(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return '[' + value.map(i => {
        const v = canonicalStringify(i);
        return v === undefined ? 'null' : v;
      }).join(',') + ']';
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value).sort();
      return '{' + keys.map(k => {
        const v = canonicalStringify(value[k]);
        return v !== undefined ? JSON.stringify(k) + ':' + v : undefined;
      }).filter(Boolean).join(',') + '}';
    }
    return 'null';
  }

  const canonicalJson = canonicalStringify(manifest);
  const canonicalBytes = Buffer.from(canonicalJson, 'utf8');
  const signature = crypto.sign(null, canonicalBytes, privateKey);

  const encodedJson = canonicalBytes.toString('base64url');
  const encodedSig = signature.toString('base64url');

  await writeFile(join(artifactsDir, 'tuari-0.5.0-stable.update'), encodedJson + '.' + encodedSig);

  const pubKeyPath = join(tmp, 'verify-pubkey.pem');
  await writeFile(pubKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));

  const result = runScript('verify-release-assets.mjs', [
    '--artifacts', artifactsDir,
    '--public-key', pubKeyPath,
    '--version', '0.5.0',
    '--channel', 'stable',
  ]);
  assert.equal(result.exitCode, 0, 'should exit with zero when artifacts are valid');
  assert.match(result.stdout, /PASS/i, 'should indicate pass');
});

test('verify-release-assets rejects tampered update package', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-test-'));
  const artifactsDir = join(tmp, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const appDir = join(tmp, 'app');
  await mkdir(appDir, { recursive: true });
  await writeFile(join(appDir, 'Tuari.exe'), 'fake binary content');

  const zipPath = join(artifactsDir, 'tuari-0.5.0-stable-portable.zip');
  await createZip(zipPath, appDir, ['Tuari.exe']);

  await writeFile(join(artifactsDir, 'tuari-0.5.0-stable.update'), 'tampered.invalid');

  const crypto = await import('node:crypto');
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const pubKeyPath = join(tmp, 'verify-pubkey.pem');
  await writeFile(pubKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));

  const result = runScript('verify-release-assets.mjs', [
    '--artifacts', artifactsDir,
    '--public-key', pubKeyPath,
    '--version', '0.5.0',
    '--channel', 'stable',
  ]);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when update package is tampered');
  assert.match(result.stderr, /signature|invalid|tampered|verify/i, 'should mention verification failure');
});
