// verify-release-assets.mjs — Post-build smoke test for release artifacts
// Usage: node scripts/verify-release-assets.mjs --artifacts <dir> [--public-key <path>] [--version <ver>] [--channel <channel>]
//
// Verifies:
// 1. The portable zip exists and contains Tuari.exe
// 2. The signed update manifest (.update) exists and signature is valid
//
// Exit code 0 = all checks pass
// Exit code 1 = any check fails

import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/verify-release-assets.mjs [options]

Verify release artifacts after a build.

Options:
  --artifacts <dir>     Directory containing built artifacts (required)
  --public-key <path>   Path to Ed25519 public key PEM file (default: auto-detect)
  --version <ver>       Release version (e.g., 0.5.0)
  --channel <channel>   Release channel (e.g., stable, nightly, beta)
  --help                Show this help

Checks:
  1. Portable zip exists and contains Tuari.exe
  2. Signed update manifest (.update) exists and signature verifies
`);
  process.exit(0);
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const artifactsDir = getArg('--artifacts');
const publicKeyPath = getArg('--public-key');
const version = getArg('--version');
const channel = getArg('--channel');

if (!artifactsDir) {
  console.error('Error: --artifacts is required');
  process.exit(1);
}

const resolvedArtifactsDir = resolve(artifactsDir);

let failures = 0;

async function check(description, fn) {
  try {
    await fn();
    console.log(`  PASS: ${description}`);
  } catch (err) {
    console.error(`  FAIL: ${description}: ${err.message}`);
    failures++;
  }
}

async function findFile(dir, pattern) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && pattern.test(entry.name)) {
      return resolve(dir, entry.name);
    }
  }
  return null;
}

async function verifyPortableZip(artifactsDir) {
  // Find the portable zip
  const zipFile = await findFile(artifactsDir, /portable\.zip$/i);
  if (!zipFile) {
    throw new Error('No portable zip file found (expected *-portable.zip)');
  }

  console.log(`  Found portable zip: ${basename(zipFile)}`);

  // Extract the zip to a temp dir and check for Tuari.exe
  const tmpDir = resolve(artifactsDir, '.verify-tmp');
  const { rmSync, mkdirSync } = await import('node:fs');

  // Clean up any previous temp
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  mkdirSync(tmpDir, { recursive: true });

  // Extract the zip
  const isWin = process.platform === 'win32';
  let extractOk = false;

  if (isWin) {
    // On Windows, use PowerShell Expand-Archive (tar chokes on C: paths)
    const extractResult = spawnSync(
      'powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipFile}' -DestinationPath '${tmpDir}' -Force`
      ],
      { encoding: 'utf8' }
    );
    extractOk = extractResult.status === 0;
    if (!extractOk) {
      throw new Error(`Cannot extract zip: PowerShell Expand-Archive exited with code ${extractResult.status}. ${extractResult.stderr}`);
    }
  } else {
    // On Unix, use tar
    const extractResult = spawnSync('tar', ['-xf', zipFile, '-C', tmpDir], {
      encoding: 'utf8',
    });
    extractOk = extractResult.status === 0;
    if (!extractOk) {
      throw new Error(`Cannot extract zip: tar exited with code ${extractResult.status}. ${extractResult.stderr}`);
    }
  }

  // Check for Tuari.exe in the extracted contents
  let exeFound = false;
  async function findExe(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (await findExe(fullPath)) return true;
      } else if (entry.name.toLowerCase() === 'tuari.exe') {
        return true;
      }
    }
    return false;
  }

  exeFound = await findExe(tmpDir);

  // Clean up
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  if (!exeFound) {
    throw new Error('Portable zip does not contain Tuari.exe');
  }
}

async function verifyUpdatePackage(artifactsDir) {
  // Find the .update file
  const updateFile = await findFile(artifactsDir, /\.update$/i);
  if (!updateFile) {
    throw new Error('No .update file found (expected *.update)');
  }

  console.log(`  Found update package: ${basename(updateFile)}`);

  // Read the signed manifest
  const signedContent = (await readFile(updateFile, 'utf8')).trim();

  // Split on the last dot separator
  const dotIndex = signedContent.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === signedContent.length - 1) {
    throw new Error('Invalid signed manifest format. Expected: <base64url(json)>.<base64url(sig)>');
  }

  const encodedJson = signedContent.slice(0, dotIndex);
  const encodedSig = signedContent.slice(dotIndex + 1);

  // Validate base64url encoding
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64urlRegex.test(encodedJson) || !base64urlRegex.test(encodedSig)) {
    throw new Error('Invalid base64url encoding in signed manifest');
  }

  const canonicalBytes = Buffer.from(encodedJson, 'base64url');
  const signatureBytes = Buffer.from(encodedSig, 'base64url');

  if (signatureBytes.length !== 64) {
    throw new Error(`Invalid signature length: ${signatureBytes.length} bytes (expected 64)`);
  }

  // Parse the manifest to validate version and channel metadata
  const manifestStr = canonicalBytes.toString('utf8');
  let manifestObj;
  try {
    manifestObj = JSON.parse(manifestStr);
  } catch {
    throw new Error('Cannot parse manifest JSON');
  }

  // Validate version if provided
  if (version) {
    const manifestVersion = manifestObj.version;
    if (!manifestVersion) {
      throw new Error('Manifest has no version field');
    }
    if (manifestVersion !== version) {
      throw new Error(`Version mismatch: expected "${version}", manifest has "${manifestVersion}"`);
    }
    console.log(`  Manifest version matches: ${manifestVersion}`);
  }

  // Validate channel if provided
  if (channel) {
    // Channel isn't embedded in the manifest, but we can verify the filename
    if (!basename(updateFile).toLowerCase().includes(channel.toLowerCase())) {
      throw new Error(`Channel mismatch: expected "${channel}" in filename, got "${basename(updateFile)}"`);
    }
    console.log(`  Channel confirmed: ${channel}`);
  }

  // Find or use provided public key
  let pubKeyPath = publicKeyPath;
  if (!pubKeyPath) {
    // Try to find it in standard locations
    const devPubKey = resolve(artifactsDir, 'dev-update-public-key.pem');
    const scriptsPubKey = resolve('scripts/dev-update-keys/dev-update-public-key.pem');
    try {
      await access(devPubKey, constants.R_OK);
      pubKeyPath = devPubKey;
    } catch {
      try {
        await access(scriptsPubKey, constants.R_OK);
        pubKeyPath = scriptsPubKey;
      } catch {
        throw new Error('No public key found. Provide --public-key or ensure dev-update-public-key.pem is available.');
      }
    }
  }

  console.log(`  Using public key: ${basename(pubKeyPath)}`);

  // Read and parse public key
  const pubKeyPem = await readFile(resolve(pubKeyPath), 'utf8');
  let publicKey;
  try {
    publicKey = createPublicKey(pubKeyPem);
  } catch (err) {
    throw new Error(`Invalid public key: ${err.message}`);
  }

  // Verify signature
  const isValid = verify(null, canonicalBytes, publicKey, signatureBytes);
  if (!isValid) {
    throw new Error('Update package signature is INVALID');
  }

  console.log('  Update package signature: VALID');
}

async function main() {
  console.log(`\n=== Release Asset Verification ===`);
  console.log(`Artifacts directory: ${resolvedArtifactsDir}`);

  // Verify artifacts directory exists
  try {
    await access(resolvedArtifactsDir, constants.R_OK);
  } catch {
    console.error(`Error: Artifacts directory does not exist: ${resolvedArtifactsDir}`);
    process.exit(1);
  }

  // Check 1: Portable zip
  console.log('\n[1/2] Portable zip verification...');
  await check('Portable zip exists with Tuari.exe', () => verifyPortableZip(resolvedArtifactsDir));

  // Check 2: Update package
  console.log('\n[2/2] Update package signature verification...');
  await check('Update package signature is valid', () => verifyUpdatePackage(resolvedArtifactsDir));

  // Summary
  console.log('');
  if (failures === 0) {
    console.log('✓ All release asset checks PASSED\n');
    process.exit(0);
  } else {
    console.error(`✗ ${failures} release asset check(s) FAILED\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
