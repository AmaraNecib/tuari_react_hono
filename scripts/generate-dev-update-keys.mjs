#!/usr/bin/env node

// generate-dev-update-keys.mjs — Generate Ed25519 key pair for development CI
// Usage: node scripts/generate-dev-update-keys.mjs [--output-dir <path>]
//
// Outputs:
//   - dev-update-public-key.txt   Rust byte array constant
//   - dev-update-private-key.pem  Ed25519 private key in PEM format

import { generateKeyPairSync } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/generate-dev-update-keys.mjs [options]

Generate an Ed25519 key pair for development update signing.

Options:
  --output-dir <path>  Output directory (default: current directory)
  --help               Show this help

Output files:
  dev-update-public-key.txt   Rust byte array: pub const UPDATE_PUBLIC_KEY: [u8; 32] = [...]
  dev-update-private-key.pem  PEM-encoded Ed25519 private key
`);
  process.exit(0);
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const outputDir = resolve(getArg('--output-dir') || '.');

async function main() {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate Ed25519 key pair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  // Export private key as PEM (PKCS#8)
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile(resolve(outputDir, 'dev-update-private-key.pem'), privateKeyPem, 'utf8');

  // Export public key and extract raw 32-byte point
  // SPKI DER format: 44 bytes total for Ed25519
  //   - 24 bytes ASN.1 header
  //   - 4 bytes BIT STRING wrapper  
  //   - 2 bytes algorithm identifier
  //   - 4 bytes OID + parameters
  //   - 2 bytes BIT STRING tag + length
  //   - 32 bytes raw public key
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublicKey = publicKeyDer.slice(-32);

  // Format as Rust byte array
  const rustConst = `pub const UPDATE_PUBLIC_KEY: [u8; 32] = [${rawPublicKey.join(', ')}]`;
  await writeFile(resolve(outputDir, 'dev-update-public-key.txt'), rustConst + '\n', 'utf8');

  console.log(`Generated Ed25519 development update keys:`);
  console.log(`  Private key: ${resolve(outputDir, 'dev-update-private-key.pem')}`);
  console.log(`  Public key:  ${resolve(outputDir, 'dev-update-public-key.txt')}`);
  console.log();
  console.log(`Rust constant:`);
  console.log(`  ${rustConst}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
