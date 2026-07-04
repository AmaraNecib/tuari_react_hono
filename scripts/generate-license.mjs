#!/usr/bin/env node

// generate-license.mjs — CLI tool for signing license files
// Usage: node scripts/generate-license.mjs --edition professional --features multi_user,lan_server --max-users 10
//        node scripts/generate-license.mjs --help

import { createHash } from "node:crypto";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(`
Usage: node generate-license.mjs [options]

Options:
  --edition <type>       Edition: standard, professional, enterprise (required)
  --features <list>      Comma-separated feature flags (optional)
  --max-users <number>   Max user accounts, 0 = unlimited (default: 1)
  --license-type <type>  perpetual, subscription, trial (default: perpetual)
  --valid-until <date>   Expiry date in ISO 8601 (optional, perpetual if omitted)
  --issued-to <string>   Customer name (required)
  --email <string>       Customer email (required)
  --private-key <path>   Path to Ed25519 private key file (required)
  --output <path>        Output file path (default: stdout)
  --help                 Show this help

Example:
  node generate-license.mjs \\
    --edition professional \\
    --features multi_user,lan_server \\
    --issued-to "Acme Corp" \\
    --email admin@acme.dz \\
    --private-key ./dev-key.pem
`);
  process.exit(0);
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const edition = getArg("--edition");
const featuresStr = getArg("--features");
const maxUsers = parseInt(getArg("--max-users") || "1", 10);
const licenseType = getArg("--license-type") || "perpetual";
const validUntil = getArg("--valid-until");
const issuedTo = getArg("--issued-to");
const email = getArg("--email");
const privateKeyPath = getArg("--private-key");
const outputPath = getArg("--output");

if (!edition) {
  console.error("Error: --edition is required");
  process.exit(1);
}
if (!["standard", "professional", "enterprise"].includes(edition)) {
  console.error(`Error: invalid edition "${edition}". Must be standard, professional, or enterprise`);
  process.exit(1);
}
if (!issuedTo) {
  console.error("Error: --issued-to is required");
  process.exit(1);
}
if (!email) {
  console.error("Error: --email is required");
  process.exit(1);
}
if (!privateKeyPath) {
  console.error("Error: --private-key is required");
  process.exit(1);
}

const features = featuresStr ? featuresStr.split(",").map((f) => f.trim()).filter(Boolean) : [];
const licenseId = `LCE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${generateId(6)}`;

const payload = {
  licenseId,
  issuedAt: new Date().toISOString(),
  issuedTo,
  email,
  edition,
  features,
  maxUsers,
  validFrom: new Date().toISOString(),
  licenseType,
};

if (validUntil) {
  payload.validUntil = validUntil;
}
if (features.length === 0) {
  delete payload.features;
}
if (maxUsers === 0) {
  payload.maxUsers = 0;
}

console.log(`Generated license:\n  ID: ${licenseId}\n  Edition: ${edition}\n  Customer: ${issuedTo}\n`);

function generateId(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
