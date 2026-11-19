// verify-release-assets.test.mjs — Tests for release asset verification script
//
// Run: node --test tests/verify-release-assets.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { extractAndCollectExecutables } from '../scripts/collect-extracted-executables.mjs';

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
 * Create a zip archive using system utility.
 * Uses PowerShell on Windows, tar/zip on Unix.
 * This is only needed for tests that simulate release artifacts.
 */
async function createZip(zipPath, sourceDir, filenames) {
  const isWin = process.platform === 'win32';

  if (isWin) {
    // PowerShell Compress-Archive works reliably on Windows
    const items = filenames.map(f => `'${join(sourceDir, f).replace(/'/g, "''")}'`).join(',');
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path @(${items}) -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'pipe', shell: true, timeout: 30000 }
    );
  } else {
    // On Unix, use the zip command with a relative path
    const relFiles = filenames.map(f => `"${f}"`).join(' ');
    execSync(
      `cd "${sourceDir}" && zip -q "${zipPath}" ${relFiles}`,
      { stdio: 'pipe', shell: true, timeout: 30000 }
    );
  }
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

  const staleDir = join(artifactsDir, '.verify-tmp');
  await mkdir(staleDir);
  await writeFile(join(staleDir, 'Tuari.exe'), 'stale app must not satisfy this ZIP');
  const diagnosticsDir = join(tmp, 'diagnostics');
  const result = runScript('verify-release-assets.mjs', ['--artifacts', artifactsDir, '--diagnostics-dir', diagnosticsDir]);
  assert.notEqual(result.exitCode, 0, 'should exit with non-zero when Tuari.exe is missing');
  assert.match(result.stderr, /Tuari\.exe/i, 'should mention missing Tuari.exe');
  const diagnostics = JSON.parse(await readFile(join(diagnosticsDir, 'portable-verification.json'), 'utf8'));
  assert.equal(diagnostics.zip.sizeBytes > 0, true);
  assert.match(diagnostics.zip.sha256, /^[a-f0-9]{64}$/);
  assert.equal(diagnostics.archiveListing.exitCode, 0);
  assert.deepEqual(diagnostics.archiveListing.entryNames, ['README.txt']);
  assert.equal(typeof diagnostics.archiveListing.stdout, 'string');
  assert.equal(typeof diagnostics.archiveListing.stderr, 'string');
  assert.equal(diagnostics.extraction.exitCode, 0);
  assert.equal(typeof diagnostics.extraction.stdout, 'string');
  assert.equal(typeof diagnostics.extraction.stderr, 'string');
  assert.deepEqual(diagnostics.extractedExecutables, []);
});

test('verify-release-assets preserves native extraction failure diagnostics for an empty ZIP', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-empty-zip-'));
  const artifactsDir = join(tmp, 'artifacts');
  const diagnosticsDir = join(tmp, 'diagnostics');
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, 'tuari-empty-portable.zip'), Buffer.alloc(0));

  const result = runScript('verify-release-assets.mjs', [
    '--artifacts', artifactsDir,
    '--diagnostics-dir', diagnosticsDir,
  ]);
  assert.notEqual(result.exitCode, 0, 'empty ZIP must fail the actual extraction check');
  assert.doesNotMatch(result.stderr, /does not contain Tuari\.exe/i, 'native extraction failure must not be reported as a missing executable');

  const diagnostics = JSON.parse(await readFile(join(diagnosticsDir, 'portable-verification.json'), 'utf8'));
  assert.equal(diagnostics.zip.sizeBytes, 0);
  assert.equal(typeof diagnostics.archiveListing.exitCode, 'number');
  assert.equal(diagnostics.extraction.exitCode === 0, false);
  assert.equal(typeof diagnostics.extraction.stdout, 'string');
  assert.equal(typeof diagnostics.extraction.stderr, 'string');
});

test('verify-release-assets keeps extraction failure and cleans up when diagnostics cannot be written', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-diagnostics-error-'));
  const artifactsDir = join(tmp, 'artifacts');
  const diagnosticsPath = join(tmp, 'diagnostics-is-a-file');
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, 'tuari-invalid-portable.zip'), Buffer.from('not a ZIP archive'));
  await writeFile(diagnosticsPath, 'block diagnostics directory creation');

  const result = runScript('verify-release-assets.mjs', [
    '--artifacts', artifactsDir,
    '--diagnostics-dir', diagnosticsPath,
  ]);

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Cannot extract zip/i, 'native extraction failure must remain the primary error');
  assert.match(result.stderr, /diagnostic/i, 'diagnostic write failure must be reported separately');
  assert.doesNotMatch(result.stderr, /does not contain Tuari\.exe/i);
  assert.deepEqual((await readdir(artifactsDir)).filter((name) => name.startsWith('.verify-tmp-')), []);
});

test('extraction inventory captures an executable written before the extractor fails', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-partial-extraction-'));
  const extractionDir = join(tmp, 'extracted');
  const nativeFailure = { status: 1, stdout: '', stderr: 'later archive entry failed' };

  const { extraction, executables } = await extractAndCollectExecutables(() => {
    mkdirSync(extractionDir, { recursive: true });
    writeFileSync(join(extractionDir, 'Tuari.exe'), 'app written before failure');
    return nativeFailure;
  }, extractionDir);

  assert.equal(extraction, nativeFailure);
  assert.deepEqual(executables, [{ path: 'Tuari.exe', sizeBytes: 26 }]);
});

test('inventory failure does not replace the extractor failure', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verify-inventory-error-'));
  const extractionDir = join(tmp, 'extracted');
  const nativeFailure = { status: 1, stderr: 'original extraction failure' };

  const { extraction, executables } = await extractAndCollectExecutables(() => {
    rmSync(extractionDir, { recursive: true, force: true });
    return nativeFailure;
  }, extractionDir);

  assert.equal(extraction, nativeFailure);
  assert.deepEqual(executables, []);
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

  const quotedArtifactsDir = join(tmp, "artifacts 'quoted'");
  await rename(artifactsDir, quotedArtifactsDir);
  const diagnosticsDir = join(tmp, "diagnostics 'quoted'");
  const result = runScript('verify-release-assets.mjs', [
    '--artifacts', quotedArtifactsDir,
    '--diagnostics-dir', diagnosticsDir,
    '--public-key', pubKeyPath,
    '--version', '0.5.0',
    '--channel', 'stable',
  ]);
  assert.equal(result.exitCode, 0, 'should exit with zero when artifacts are valid');
  assert.match(result.stdout, /PASS/i, 'should indicate pass');
  const diagnostics = JSON.parse(await readFile(join(diagnosticsDir, 'portable-verification.json'), 'utf8'));
  assert.equal(diagnostics.extraction.exitCode, 0);
  assert.ok(diagnostics.zip.path.includes("artifacts 'quoted'"));
  assert.ok(diagnostics.archiveListing.entryNames.some((name) => name.toLowerCase() === 'tuari.exe'));
  assert.ok(diagnostics.extractedExecutables.some(({ path }) => path.toLowerCase() === 'tuari.exe'));

  const blockedDiagnostics = join(tmp, 'diagnostics-blocked');
  await writeFile(blockedDiagnostics, 'not a directory');
  const missingEvidence = runScript('verify-release-assets.mjs', [
    '--artifacts', quotedArtifactsDir,
    '--diagnostics-dir', blockedDiagnostics,
    '--public-key', pubKeyPath,
    '--version', '0.5.0',
    '--channel', 'stable',
  ]);
  assert.notEqual(missingEvidence.exitCode, 0, 'valid artifacts must not pass when requested diagnostics cannot be saved');
  assert.match(missingEvidence.stdout, /Update package signature: VALID/);
  assert.match(missingEvidence.stderr, /diagnostic write failed/i);
  assert.deepEqual((await readdir(quotedArtifactsDir)).filter((name) => name.startsWith('.verify-tmp-')), []);
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
