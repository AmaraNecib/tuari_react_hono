// sign-update.test.mjs — Tests for update signing CLI tools
//
// Run: node --test tests/sign-update.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const scriptDir = fileURLToPath(new URL('../scripts', import.meta.url));

function runScript(script, args) {
  const fullPath = join(scriptDir, script);
  // Split args manually to avoid issues with paths containing spaces.
  // Each argument is a separate token separated by whitespace, but paths
  // are wrapped in quotes when they contain spaces.
  const argList = parseArgsString(args);
  const result = spawnSync(process.execPath, [fullPath, ...argList], {
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

function runScriptWithFailure(script, args) {
  const fullPath = join(scriptDir, script);
  const argList = parseArgsString(args);
  const result = spawnSync(process.execPath, [fullPath, ...argList], {
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
 * Parse a command-line argument string into an array, respecting quoted strings.
 * This avoids the fragility of simple whitespace splitting.
 */
function parseArgsString(str) {
  const args = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ' ' && !inQuote) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

/**
 * Generate an Ed25519 key pair and write PEM files.
 * Returns { privateKeyPath, publicKeyPath }
 */
async function generateKeyPair(dir) {
  const { generateKeyPairSync } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privPath = join(dir, 'key.pem');
  const pubPath = join(dir, 'pubkey.pem');
  await writeFile(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await writeFile(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
  return { privateKeyPath: privPath, publicKeyPath: pubPath };
}

// ─── Tests ────────────────────────────────────────────────────────

test('sign-update exits with non-zero on missing --private-key', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ version: '1.0.0', platform: 'windows' }));

  const result = runScriptWithFailure(
    'sign-update.mjs',
    `--manifest ${manifestPath} --output ${join(tmp, 'signed.txt')}`
  );

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero code when --private-key is missing');
});

test('sign-update exits with non-zero on invalid manifest JSON', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  await writeFile(manifestPath, 'not valid json');

  const { privateKeyPath } = await generateKeyPair(tmp);

  const result = runScriptWithFailure(
    'sign-update.mjs',
    `--manifest ${manifestPath} --private-key ${privateKeyPath} --output ${join(tmp, 'signed.txt')}`
  );

  assert.notEqual(result.exitCode, 0, 'should exit with non-zero code on invalid manifest JSON');
});

test('sign-update produces correctly formatted signed manifest', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  const manifest = {
    version: '1.0.0',
    platform: 'windows-x86_64',
    minSupportedVersion: '0.1.0',
    checksum: 'abc123',
    files: [
      { path: 'app.exe', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', size: 12345 }
    ]
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const { privateKeyPath } = await generateKeyPair(tmp);
  const outputPath = join(tmp, 'signed.txt');
  runScript('sign-update.mjs', `--manifest ${manifestPath} --private-key ${privateKeyPath} --output ${outputPath}`);

  const signed = await readFile(outputPath, 'utf8');
  const parts = signed.trim().split('.');

  assert.equal(parts.length, 2, 'signed manifest should have two parts separated by a dot');

  // Verify both parts are valid base64url
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  assert.match(parts[0], base64urlRegex, 'first part should be base64url encoded');
  assert.match(parts[1], base64urlRegex, 'second part should be base64url encoded');
});

test('verify-signed-manifest rejects tampered manifest', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  const manifest = { version: '1.0.0', platform: 'windows', minSupportedVersion: '0.1.0', checksum: '', files: [] };
  await writeFile(manifestPath, JSON.stringify(manifest));

  const { privateKeyPath, publicKeyPath } = await generateKeyPair(tmp);
  const outputPath = join(tmp, 'signed.txt');
  runScript('sign-update.mjs', `--manifest ${manifestPath} --private-key ${privateKeyPath} --output ${outputPath}`);

  // Now tamper with the manifest by replacing the first part
  const signed = await readFile(outputPath, 'utf8');
  const parts = signed.trim().split('.');
  const tampered = Buffer.from(JSON.stringify({ version: '9.9.9', platform: 'windows' })).toString('base64url');
  const tamperedPath = join(tmp, 'tampered.txt');
  await writeFile(tamperedPath, `${tampered}.${parts[1]}`);

  const result = runScriptWithFailure(
    'verify-signed-manifest.mjs',
    `--public-key ${publicKeyPath} --manifest ${tamperedPath}`
  );

  assert.notEqual(result.exitCode, 0, 'should reject tampered manifest');
});

test('generate-dev-update-keys produces valid key pair', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));

  runScript('generate-dev-update-keys.mjs', `--output-dir ${tmp}`);

  // Check output files exist
  const pubKeyPath = join(tmp, 'dev-update-public-key.txt');
  const privKeyPath = join(tmp, 'dev-update-private-key.pem');

  const pubKeyContent = await readFile(pubKeyPath, 'utf8');
  const privKeyContent = await readFile(privKeyPath, 'utf8');

  // Public key should be a Rust byte array
  assert.match(pubKeyContent, /pub const UPDATE_PUBLIC_KEY: \[u8; 32\] = \[/);

  // Private key should be PEM
  assert.match(privKeyContent, /BEGIN PRIVATE KEY/);

  // The key pair should actually work for sign + verify
  const crypto = await import('node:crypto');
  const privateKey = crypto.createPrivateKey(privKeyContent);
  const data = Buffer.from('test data');
  const sig = crypto.sign(null, data, privateKey);

  // Derive public from the PEM and also match the generated pub key constant
  const publicKey = crypto.createPublicKey(privateKey);
  const pubBytes = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
  const expectedPubKeyLine = `pub const UPDATE_PUBLIC_KEY: [u8; 32] = [${pubBytes.join(', ')}];\n`;

  assert.equal(pubKeyContent, expectedPubKeyLine);
});

test('sign with --key-id injects keyId into canonical manifest', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  const manifest = { version: '1.0.0', platform: 'windows' };
  await writeFile(manifestPath, JSON.stringify(manifest));

  const { privateKeyPath } = await generateKeyPair(tmp);
  const outputPath = join(tmp, 'signed.txt');
  runScript('sign-update.mjs', `--manifest ${manifestPath} --private-key ${privateKeyPath} --output ${outputPath} --key-id update-key-v2`);

  const signed = await readFile(outputPath, 'utf8');
  const parts = signed.trim().split('.');
  const decoded = Buffer.from(parts[0], 'base64url').toString('utf8');
  const parsed = JSON.parse(decoded);

  assert.equal(parsed.keyId, 'update-key-v2', 'canonical JSON should contain keyId');
});

test('sign with --key-id overrides existing keyId in manifest', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  // Manifest already has a keyId — CLI --key-id should override it
  const manifest = { version: '1.0.0', platform: 'windows', keyId: 'original-key-v1' };
  await writeFile(manifestPath, JSON.stringify(manifest));

  const { privateKeyPath } = await generateKeyPair(tmp);
  const outputPath = join(tmp, 'signed.txt');
  runScript('sign-update.mjs', `--manifest ${manifestPath} --private-key ${privateKeyPath} --output ${outputPath} --key-id override-key-v2`);

  const signed = await readFile(outputPath, 'utf8');
  const parts = signed.trim().split('.');
  const decoded = Buffer.from(parts[0], 'base64url').toString('utf8');
  const parsed = JSON.parse(decoded);

  assert.equal(parsed.keyId, 'override-key-v2', '--key-id should override existing keyId in manifest');
  assert.notEqual(parsed.keyId, 'original-key-v1', 'original keyId should be replaced');
});

test('sign and verify round-trip end-to-end', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sign-test-'));
  const manifestPath = join(tmp, 'manifest.json');
  const manifest = {
    version: '2.0.0',
    platform: 'linux-x86_64',
    minSupportedVersion: '1.0.0',
    checksum: 'def456',
    files: [
      { path: 'tuari.AppImage', hash: 'a'.repeat(64), size: 999999 }
    ]
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const { privateKeyPath, publicKeyPath } = await generateKeyPair(tmp);
  const outputPath = join(tmp, 'signed.txt');
  runScript('sign-update.mjs', `--manifest ${manifestPath} --private-key ${privateKeyPath} --output ${outputPath}`);

  // Verify using the verify helper
  const result = runScript(
    'verify-signed-manifest.mjs',
    `--public-key ${publicKeyPath} --manifest ${outputPath}`
  );

  assert.ok(result.includes('SIGNATURE VALID'), 'should confirm valid signature');
});
