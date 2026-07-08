#!/usr/bin/env node

// sign-update.mjs — CLI tool for signing update manifests with Ed25519
// Usage: node scripts/sign-update.mjs --private-key <path> --manifest <path> --output <path>
//
// Output format: <base64url(canonical_json)>.<base64url(signature)>

import { createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/sign-update.mjs [options]

Sign an update manifest with an Ed25519 private key.

Options:
  --private-key <path>  Path to Ed25519 private key PEM file (required)
  --manifest <path>     Path to manifest.json to sign (required)
  --output <path>       Output file path for signed manifest (required)
  --help                Show this help

Output format:
  <base64url(canonical_json)>.<base64url(signature)>

The canonical JSON uses deterministic field ordering (sorted keys).
`);
  process.exit(0);
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const privateKeyPath = getArg('--private-key');
const manifestPath = getArg('--manifest');
const outputPath = getArg('--output');

if (!privateKeyPath) {
  console.error('Error: --private-key is required');
  process.exit(1);
}

if (!manifestPath) {
  console.error('Error: --manifest is required');
  process.exit(1);
}

if (!outputPath) {
  console.error('Error: --output is required');
  process.exit(1);
}

/**
 * Produce canonical JSON with deterministic key ordering.
 *
 * Rules:
 * - Object keys are sorted alphabetically.
 * - No whitespace between tokens.
 * - Arrays preserve element order.
 * - Strings are UTF-8 encoded.
 */
function canonicalStringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const elements = value.map(canonicalStringify);
    return '[' + elements.join(',') + ']';
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((key) => {
      const k = JSON.stringify(key);
      const v = canonicalStringify(value[key]);
      return k + ':' + v;
    });
    return '{' + pairs.join(',') + '}';
  }

  return 'null';
}

async function main() {
  // Read private key
  let privateKeyPem;
  try {
    privateKeyPem = await readFile(resolve(privateKeyPath), 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read private key file "${privateKeyPath}": ${err.message}`);
    process.exit(1);
  }

  // Parse private key
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch (err) {
    console.error(`Error: Invalid private key: ${err.message}`);
    process.exit(1);
  }

  // Read manifest
  let manifestRaw;
  try {
    manifestRaw = await readFile(resolve(manifestPath), 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read manifest file "${manifestPath}": ${err.message}`);
    process.exit(1);
  }

  // Parse manifest to validate it's valid JSON
  let manifestObj;
  try {
    manifestObj = JSON.parse(manifestRaw);
  } catch (err) {
    console.error('Error: Invalid manifest JSON: ' + err.message);
    process.exit(1);
  }

  // Produce canonical JSON bytes
  const canonicalJson = canonicalStringify(manifestObj);
  const canonicalBytes = Buffer.from(canonicalJson, 'utf8');

  // Sign with Ed25519
  const signature = sign(null, canonicalBytes, privateKey);

  // Encode both parts as base64url
  const encodedJson = canonicalBytes.toString('base64url');
  const encodedSig = signature.toString('base64url');

  // Write output: <base64url(canonical_json)>.<base64url(signature)>
  const output = encodedJson + '.' + encodedSig;
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, output, 'utf8');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
