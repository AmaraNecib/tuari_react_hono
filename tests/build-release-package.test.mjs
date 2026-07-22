// build-release-package.test.mjs — Tests for build-release-package.mjs
//
// Run: node --test tests/build-release-package.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash, generateKeyPairSync } from 'node:crypto';

const scriptDir = fileURLToPath(new URL('../scripts', import.meta.url));
const { readZipBuffer, validatePackage } = await import(new URL('./build-release-package.mjs', 
  new URL('../scripts/', import.meta.url)).href);

/**
 * Run build-release-package.mjs with the given arguments.
 * Throws if the script fails.
 */
function runBuild(args) {
  const result = spawnSync(process.execPath, [join(scriptDir, 'build-release-package.mjs'), ...args], {
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

/**
 * Run build-release-package.mjs expecting failure.
 */
function runBuildWithFailure(args) {
  const result = spawnSync(process.execPath, [join(scriptDir, 'build-release-package.mjs'), ...args], {
    encoding: 'utf8',
    cwd: scriptDir,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Generate an Ed25519 key pair for testing.
 */
async function makeKeyPair(dir) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privPath = join(dir, 'key.pem');
  const pubPath = join(dir, 'pubkey.pem');
  await writeFile(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await writeFile(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
  return { privateKeyPath: privPath, publicKeyPath: pubPath };
}

/**
 * Set up fake dist directories.
 */
async function makeDistDirs(base) {
  const webDist = join(base, 'web-dist');
  const apiDist = join(base, 'api-dist');
  await mkdir(webDist, { recursive: true });
  await mkdir(apiDist, { recursive: true });

  await mkdir(join(webDist, 'assets'), { recursive: true });
  await writeFile(join(webDist, 'index.html'), '<html>test</html>');
  await writeFile(join(webDist, 'assets', 'app.js'), 'console.log("test");');
  await writeFile(join(webDist, 'assets', 'style.css'), 'body { color: red; }');

  await mkdir(join(apiDist, 'routes'), { recursive: true });
  await writeFile(join(apiDist, 'index.js'), 'module.exports = {};');
  await writeFile(join(apiDist, 'routes', 'api.js'), '// API routes');

  return { webDist, apiDist };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('build-release-package produces valid .update package', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  runBuild([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '42',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
  ]);

  // Check output files exist
  const updatePath = join(outDir, 'tuari-0.5.0-stable.update');
  const updatesJsonPath = join(outDir, 'updates.json');
  const changelogPath = join(outDir, 'CHANGELOG-0.5.0.md');

  assert.ok(existsSync(updatePath), '.update file should exist');
  assert.ok(existsSync(updatesJsonPath), 'updates.json should exist');
  assert.ok(existsSync(changelogPath), 'changelog should exist');

  // Verify ZIP structure
  const zipData = await readFile(updatePath);
  assert.equal(zipData.readUInt32LE(0), 0x04034b50, 'should start with ZIP local file header');

  // Extract and validate manifest using exported readZipBuffer
  const extracted = readZipBuffer(zipData);
  assert.ok(extracted.has('manifest.json'), 'ZIP should contain manifest.json');

  const manifest = JSON.parse(extracted.get('manifest.json').toString('utf8'));
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.version, '0.5.0');
  assert.equal(manifest.minSupportedVersion, '0.4.0');
  assert.equal(manifest.platform, 'windows-x86_64');
  assert.ok(manifest.signature, 'manifest should have signature field');

  // Verify files from dist in manifest
  const manifestPaths = manifest.files.map(f => f.path);
  assert.ok(manifestPaths.includes('web/dist/index.html'));
  assert.ok(manifestPaths.includes('api/dist/index.js'));

  // Verify each file in manifest exists in ZIP with matching hash
  for (const mf of manifest.files) {
    const data = extracted.get(mf.path);
    assert.ok(data, `File "${mf.path}" should exist in ZIP`);
    const hash = createHash('sha256').update(data).digest('hex');
    assert.equal(hash, mf.hash, `Hash for "${mf.path}" should match`);
  }

  // Verify updates.json
  const updatesJson = JSON.parse(await readFile(updatesJsonPath, 'utf8'));
  assert.equal(updatesJson.latestVersion, '0.5.0');
  assert.equal(updatesJson.channel, 'stable');
  assert.equal(updatesJson.buildNumber, 42);
  assert.ok(updatesJson.updatePackageSha256);
  assert.ok(updatesJson.updatePackageSize > 0);

  // Verify changelog format
  const changelog = await readFile(changelogPath, 'utf8');
  assert.ok(changelog.startsWith('# Changelog'));
  assert.ok(changelog.includes('## 0.5.0'));
});

test('build-release-package works with --desktop-binary', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  const binaryPath = join(tmp, 'tuari.exe');
  await writeFile(binaryPath, 'fake desktop binary content');

  runBuild([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '100',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--desktop-binary', binaryPath,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
  ]);

  const extracted = readZipBuffer(await readFile(join(outDir, 'tuari-0.5.0-stable.update')));
  const manifest = JSON.parse(extracted.get('manifest.json').toString('utf8'));
  const paths = manifest.files.map(f => f.path);
  assert.ok(paths.includes('bin/tuari.exe'), 'desktop binary should be in manifest');
});

test('build-release-package accepts --skip-changelog', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  runBuild([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '1',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
    '--skip-changelog',
  ]);

  assert.ok(existsSync(join(outDir, 'tuari-0.5.0-stable.update')));
  assert.ok(existsSync(join(outDir, 'updates.json')));
  assert.ok(!existsSync(join(outDir, 'CHANGELOG-0.5.0.md')), 'changelog should not exist');
});

test('build-release-package accepts --skip-validation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  runBuild([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '1',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
    '--skip-validation',
  ]);

  assert.ok(existsSync(join(outDir, 'tuari-0.5.0-stable.update')));
  assert.ok(existsSync(join(outDir, 'updates.json')));
});

test('build-release-package fails with missing required args', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const keys = await makeKeyPair(tmp);

  const result = runBuildWithFailure([
    '--channel', 'stable',
    '--build-number', '1',
    '--output-dir', tmp,
    '--web-dist', tmp,
    '--api-dist', tmp,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
  ]);

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero on missing --version');
});

test('build-release-package fails with nonexistent --web-dist', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const keys = await makeKeyPair(tmp);

  const result = runBuildWithFailure([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '1',
    '--output-dir', tmp,
    '--web-dist', join(tmp, 'nonexistent'),
    '--api-dist', tmp,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
  ]);

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero for nonexistent web-dist');
});

test('build-release-package with desktop binary works with --skip-validation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  const binaryPath = join(tmp, 'tuari.exe');
  await writeFile(binaryPath, 'some binary data');

  runBuild([
    '--version', '0.6.0',
    '--channel', 'beta',
    '--build-number', '200',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--desktop-binary', binaryPath,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.5.0',
    '--skip-validation',
    '--skip-changelog',
  ]);

  // Verify the .update file has all files
  const extracted = readZipBuffer(await readFile(join(outDir, 'tuari-0.6.0-beta.update')));
  const manifest = JSON.parse(extracted.get('manifest.json').toString('utf8'));
  const paths = manifest.files.map(f => f.path);
  assert.ok(paths.includes('bin/tuari.exe'));
  assert.ok(paths.includes('web/dist/index.html'));
  assert.ok(paths.includes('api/dist/index.js'));
  assert.equal(manifest.files.length, 6, 'should have all 6 content files (3 web + 2 api + 1 binary)');
});

test('Generated updates.json is valid JSON with all required fields', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  runBuild([
    '--version', '0.7.0',
    '--channel', 'nightly',
    '--build-number', '999',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.6.0',
  ]);

  const raw = await readFile(join(outDir, 'updates.json'), 'utf8');
  const meta = JSON.parse(raw);

  const required = ['latestVersion', 'minSupportedVersion', 'channel', 'buildNumber',
    'updatePackageSha256', 'updatePackageSize', 'releaseDate'];
  for (const field of required) {
    assert.ok(meta[field] !== undefined, `Missing required field: ${field}`);
  }

  assert.equal(meta.latestVersion, '0.7.0');
  assert.equal(meta.channel, 'nightly');
  assert.equal(meta.buildNumber, 999);
  assert.ok(typeof meta.updatePackageSha256 === 'string' && meta.updatePackageSha256.length === 64,
    'SHA-256 should be 64 hex chars');
  assert.ok(meta.updatePackageSize > 0, 'size should be positive');
});

// ─── Validation Tests ───────────────────────────────────────────────────────

test('Package with a mismatched file hash is rejected by validation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  // Build a valid package first (with --skip-validation so we control the validator call)
  runBuild([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '42',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
    '--skip-validation',
    '--skip-changelog',
  ]);

  const updatePath = join(outDir, 'tuari-0.5.0-stable.update');
  const zipData = await readFile(updatePath);
  const extracted = readZipBuffer(zipData);

  // Tamper: change the hash of the first file in the manifest to an incorrect value
  const manifest = JSON.parse(extracted.get('manifest.json').toString('utf8'));
  const realHash = manifest.files[0].hash;
  manifest.files[0].hash = '0000000000000000000000000000000000000000000000000000000000000000';
  delete manifest.signature;

  // Re-sign the tampered manifest so the signature itself is valid;
  // the validator should still reject because the file's actual content
  // does not match the (now wrong) hash in the manifest.
  const tmpManifest = join(tmp, 'tampered-manifest.json');
  await writeFile(tmpManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const tamperedSignedPath = join(tmp, 'tampered.signed');
  spawnSync(process.execPath, [
    join(scriptDir, 'sign-update.mjs'),
    '--manifest', tmpManifest,
    '--private-key', keys.privateKeyPath,
    '--output', tamperedSignedPath,
  ], { encoding: 'utf8', cwd: scriptDir });

  const signedText = (await readFile(tamperedSignedPath, 'utf8')).trim();
  manifest.signature = signedText.slice(signedText.lastIndexOf('.') + 1);

  // Rebuild the .update ZIP with the tampered manifest
  const { buildZip } = await import(new URL('./build-release-package.mjs',
    new URL('../scripts/', import.meta.url)).href);
  // buildZip is not exported, so rebuild using our local knowledge.
  // Use a fresh read of the original ZIP and swap the manifest entry.
  const newEntries = [];
  for (const [name, data] of extracted) {
    if (name === 'manifest.json') {
      newEntries.push({ name, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8') });
    } else {
      newEntries.push({ name, data });
    }
  }
  // The .update was built with the now-outdated checksum baked in. Recompute.
  const newZip = buildZip(newEntries);
  await writeFile(updatePath, newZip);

  // Now call the real validator and assert it rejects.
  await assert.rejects(
    validatePackage(updatePath, keys.publicKeyPath),
    /hash mismatch|File integrity check failed/i,
    'validatePackage should reject a package with a mismatched file hash'
  );
  assert.notEqual(realHash, manifest.files[0].hash, 'test should have actually changed the hash');
});

test('Package with missing file from manifest is rejected by validation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'brp-test-'));
  const dists = await makeDistDirs(tmp);
  const keys = await makeKeyPair(tmp);
  const outDir = join(tmp, 'release');
  await mkdir(outDir, { recursive: true });

  // Build a valid package
  runBuild([
    '--version', '0.5.0',
    '--channel', 'stable',
    '--build-number', '42',
    '--output-dir', outDir,
    '--web-dist', dists.webDist,
    '--api-dist', dists.apiDist,
    '--private-key', keys.privateKeyPath,
    '--public-key', keys.publicKeyPath,
    '--min-supported-version', '0.4.0',
    '--skip-validation',
    '--skip-changelog',
  ]);

  const updatePath = join(outDir, 'tuari-0.5.0-stable.update');
  const zipData = await readFile(updatePath);
  const extracted = readZipBuffer(zipData);

  // Tamper: add a file to the manifest that does not exist in the ZIP
  const manifest = JSON.parse(extracted.get('manifest.json').toString('utf8'));
  manifest.files.push({
    path: 'nonexistent-file.bin',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    size: 0,
  });
  delete manifest.signature;

  // Re-sign
  const tmpManifest = join(tmp, 'missing-file-manifest.json');
  await writeFile(tmpManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const tamperedSignedPath = join(tmp, 'missing-file.signed');
  spawnSync(process.execPath, [
    join(scriptDir, 'sign-update.mjs'),
    '--manifest', tmpManifest,
    '--private-key', keys.privateKeyPath,
    '--output', tamperedSignedPath,
  ], { encoding: 'utf8', cwd: scriptDir });

  const signedText = (await readFile(tamperedSignedPath, 'utf8')).trim();
  manifest.signature = signedText.slice(signedText.lastIndexOf('.') + 1);

  // Rebuild the .update ZIP with the tampered manifest (no actual file added to ZIP)
  const newEntries = [];
  for (const [name, data] of extracted) {
    if (name === 'manifest.json') {
      newEntries.push({ name, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8') });
    } else {
      newEntries.push({ name, data });
    }
  }
  const { buildZip } = await import(new URL('./build-release-package.mjs',
    new URL('../scripts/', import.meta.url)).href);
  const newZip = buildZip(newEntries);
  await writeFile(updatePath, newZip);

  // Now call the real validator and assert it rejects.
  await assert.rejects(
    validatePackage(updatePath, keys.publicKeyPath),
    /not found in ZIP|File integrity check failed/i,
    'validatePackage should reject a package whose manifest lists a file that is not in the ZIP'
  );
});
