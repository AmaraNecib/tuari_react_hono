// verify-signed-manifest.mjs — Verify a signed update manifest
// Usage: node scripts/verify-signed-manifest.mjs --public-key <path> --manifest <path>
//
// Verifies that the signature matches the canonical manifest content.

import { createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/verify-signed-manifest.mjs [options]

Verify an Ed25519 signature on a signed update manifest.

Options:
  --public-key <path>  Path to Ed25519 public key PEM file (required)
  --manifest <path>    Path to signed manifest file (required)
  --help               Show this help
`);
  process.exit(0);
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const publicKeyPath = getArg('--public-key');
const manifestPath = getArg('--manifest');

if (!publicKeyPath) {
  console.error('Error: --public-key is required');
  process.exit(1);
}

if (!manifestPath) {
  console.error('Error: --manifest is required');
  process.exit(1);
}

async function main() {
  // Read public key
  let publicKeyPem;
  try {
    publicKeyPem = await readFile(resolve(publicKeyPath), 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read public key file "${publicKeyPath}": ${err.message}`);
    process.exit(1);
  }

  // Parse public key
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch (err) {
    console.error(`Error: Invalid public key: ${err.message}`);
    process.exit(1);
  }

  // Read signed manifest
  let signedContent;
  try {
    signedContent = await readFile(resolve(manifestPath), 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read manifest file "${manifestPath}": ${err.message}`);
    process.exit(1);
  }

  signedContent = signedContent.trim();

  // Split on the dot separator
  const dotIndex = signedContent.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === signedContent.length - 1) {
    console.error('Error: Invalid signed manifest format. Expected: <base64url(json)>.<base64url(sig)>');
    process.exit(1);
  }

  const encodedJson = signedContent.slice(0, dotIndex);
  const encodedSig = signedContent.slice(dotIndex + 1);

  // Validate base64url encoding before decoding
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64urlRegex.test(encodedJson) || !base64urlRegex.test(encodedSig)) {
    console.error('Error: Invalid base64url encoding in signed manifest');
    process.exit(1);
  }

  // Decode (Buffer.from with 'base64url' never throws on invalid input,
  // so we validate with regex first)
  const canonicalBytes = Buffer.from(encodedJson, 'base64url');
  const signatureBytes = Buffer.from(encodedSig, 'base64url');

  if (signatureBytes.length !== 64) {
    console.error('Error: Invalid signature length. Expected 64 bytes.');
    process.exit(1);
  }

  // Verify the signature
  const isValid = verify(null, canonicalBytes, publicKey, signatureBytes);

  if (isValid) {
    console.log('SIGNATURE VALID: The manifest signature matches the public key.');
    process.exit(0);
  } else {
    console.error('SIGNATURE INVALID: The manifest content does not match the signature.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
