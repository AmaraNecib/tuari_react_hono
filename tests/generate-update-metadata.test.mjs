// generate-update-metadata.test.mjs — Tests for generate-update-metadata.mjs
//
// Run: node --test tests/generate-update-metadata.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = fileURLToPath(new URL('../scripts', import.meta.url));

function runScript(args) {
  const result = spawnSync(process.execPath, [join(scriptDir, 'generate-update-metadata.mjs'), ...args], {
    encoding: 'utf8',
    cwd: scriptDir,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = result.stderr || result.stdout || `exit code ${result.status}`;
    throw new Error(msg);
  }
  return result.stdout;
}

function runScriptWithFailure(args) {
  const result = spawnSync(process.execPath, [join(scriptDir, 'generate-update-metadata.mjs'), ...args], {
    encoding: 'utf8',
    cwd: scriptDir,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

test('generate-update-metadata produces valid updates.json', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gen-upd-test-'));
  const pkgPath = join(tmp, 'test-package.bin');
  await writeFile(pkgPath, 'fake update package content');

  runScript([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '42',
    '--min-supported-version', '0.4.0',
    '--update-package', pkgPath,
    '--output-dir', tmp,
    '--download-url', 'https://releases.example.com/tuari-0.5.0-stable.update',
  ]);

  const metadata = JSON.parse(await readFile(join(tmp, 'updates.json'), 'utf8'));

  // Verify all required fields
  const requiredFields = ['latestVersion', 'minSupportedVersion', 'channel', 'buildNumber',
    'updatePackageSha256', 'updatePackageSize', 'releaseDate', 'downloadUrl'];
  for (const field of requiredFields) {
    assert.ok(metadata[field] !== undefined, `Missing required field: ${field}`);
  }

  assert.equal(metadata.latestVersion, '0.5.0');
  assert.equal(metadata.channel, 'stable');
  assert.equal(metadata.buildNumber, 42);
  assert.equal(metadata.minSupportedVersion, '0.4.0');
  assert.ok(metadata.updatePackageSha256.length > 0, 'SHA-256 hash should be present');
  assert.ok(metadata.updatePackageSize > 0, 'Package size should be positive');
  assert.ok(metadata.releaseDate, 'Release date should be present');
  assert.ok(metadata.downloadUrl, 'Download URL should be present');

  // Verify SHA-256 hash correctness
  const { createHash } = await import('node:crypto');
  const pkgData = await readFile(pkgPath);
  const expectedHash = createHash('sha256').update(pkgData).digest('hex');
  assert.equal(metadata.updatePackageSha256, expectedHash);
});

test('generate-update-metadata works without --download-url', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gen-upd-test-'));
  const pkgPath = join(tmp, 'test-package.bin');
  await writeFile(pkgPath, 'some content');

  runScript([
    '--version', '0.6.0',
    '--channel', 'beta',
    '--build-number', '100',
    '--min-supported-version', '0.5.0',
    '--update-package', pkgPath,
    '--output-dir', tmp,
  ]);

  const metadata = JSON.parse(await readFile(join(tmp, 'updates.json'), 'utf8'));
  assert.equal(metadata.latestVersion, '0.6.0');
  assert.equal(metadata.channel, 'beta');
  // downloadUrl should be absent since not provided
  assert.equal(metadata.downloadUrl, undefined);
});

test('generate-update-metadata exits with error on missing --version', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gen-upd-test-'));

  const result = runScriptWithFailure([
    '--channel', 'stable',
    '--build-number', '1',
    '--min-supported-version', '0.4.0',
    '--update-package', join(tmp, 'nonexistent'),
    '--output-dir', tmp,
  ]);

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero code when --version is missing');
});

test('generate-update-metadata exits with error on non-numeric --build-number', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gen-upd-test-'));
  const pkgPath = join(tmp, 'pkg.bin');
  await writeFile(pkgPath, 'data');

  const result = runScriptWithFailure([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', 'not-a-number',
    '--min-supported-version', '0.4.0',
    '--update-package', pkgPath,
    '--output-dir', tmp,
  ]);

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero on non-numeric build-number');
  assert.match(result.stderr, /--build-number must be a non-negative integer/);
});

test('generate-update-metadata exits with error on missing --update-package file', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gen-upd-test-'));

  const result = runScriptWithFailure([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '1',
    '--min-supported-version', '0.4.0',
    '--update-package', join(tmp, 'nonexistent.update'),
    '--output-dir', tmp,
  ]);

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero code when update package does not exist');
});

test('updates.json has valid JSON format', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gen-upd-test-'));
  const pkgPath = join(tmp, 'pkg.bin');
  await writeFile(pkgPath, 'data');

  runScript([
    '--version', '1.0.0',
    '--channel', 'nightly',
    '--build-number', '999',
    '--min-supported-version', '0.9.0',
    '--update-package', pkgPath,
    '--output-dir', tmp,
  ]);

  const raw = await readFile(join(tmp, 'updates.json'), 'utf8');
  // Should parse without error
  const parsed = JSON.parse(raw);
  assert.equal(parsed.latestVersion, '1.0.0');
  assert.equal(parsed.channel, 'nightly');
  assert.equal(parsed.buildNumber, 999);
});
