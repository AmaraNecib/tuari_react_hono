#!/usr/bin/env node

// generate-license.mjs — CLI tool for signing license files
// Usage: node scripts/generate-license.mjs --edition professional --features multi_user,lan_server --max-users 10
//        node scripts/generate-license.mjs --help
//
// Output is the signed wire format the desktop app verifies:
//   <base64url(payload JSON)>.<base64url(Ed25519 signature)>
// The signature must be produced by the private half of the key embedded as
// `EMBEDDED_PUBLIC_KEY` in apps/desktop/src-tauri/src/license.rs.
//
// stdout carries the license value and nothing else, so `> customer.lic`
// produces a file the app accepts. Progress/summary text goes to stderr.

import { createPrivateKey, sign as ed25519Sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LICENSE_TYPES = ["perpetual", "subscription", "trial"];
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
// RFC 3339 date-time with a mandatory zone (Z or ±HH:MM). The app's Rust
// verifier uses chrono's parse_from_rfc3339, so a bare date is rejected there
// and silently becomes a perpetual license. Normalise before signing.
const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

export function parseSeatCount(raw) {
  const value = raw === undefined ? "1" : raw;
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `--max-users must be a non-negative integer (0 = unlimited), got "${value}"`,
    );
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--max-users is out of range: "${value}"`);
  }
  return parsed;
}

export function normalizeLicenseType(raw) {
  const value = raw === undefined ? "perpetual" : raw;
  if (!LICENSE_TYPES.includes(value)) {
    throw new Error(
      `--license-type must be one of ${LICENSE_TYPES.join(", ")}, got "${value}"`,
    );
  }
  return value;
}

export function normalizeValidUntil(raw) {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (value === "") return null;

  if (DATE_ONLY_RE.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new Error(`--valid-until is not a real calendar date: "${value}"`);
    }
    return `${value}T00:00:00Z`;
  }

  if (RFC3339_RE.test(value)) {
    if (Number.isNaN(new Date(value).getTime())) {
      throw new Error(
        `--valid-until is not a valid RFC 3339 timestamp: "${value}"`,
      );
    }
    return value;
  }

  throw new Error(
    `--valid-until must be an RFC 3339 timestamp (e.g. 2027-01-01T00:00:00Z) or a date (YYYY-MM-DD), got "${value}"`,
  );
}

export function assertExpiryForType(licenseType, validUntil) {
  if (licenseType !== "perpetual" && !validUntil) {
    throw new Error(
      `--valid-until is required for --license-type ${licenseType}; only perpetual licenses may omit it`,
    );
  }
}

// ── Sign ──────────────────────────────────────────────────────────────
// base64url WITH padding: the Rust verifier uses base64's URL_SAFE engine,
// which rejects an unpadded payload (Node's base64url output is unpadded).
export function base64Url(buf) {
  const encoded = buf.toString("base64url");
  return encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
}

function usage() {
  return `
Usage: node generate-license.mjs [options]

Options:
  --edition <type>       Edition: standard, professional, enterprise (required)
  --features <list>      Comma-separated feature flags (optional)
  --max-users <number>   Max user accounts, 0 = unlimited (default: 1)
  --license-type <type>  perpetual, subscription, trial (default: perpetual)
  --valid-until <date>   Expiry as RFC 3339 (2027-01-01T00:00:00Z) or a date
                         (2027-01-01). Required for subscription/trial.
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
`;
}

function getArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function generateId(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(usage());
    return 0;
  }

  const edition = getArg(args, "--edition");
  const featuresStr = getArg(args, "--features");
  const issuedTo = getArg(args, "--issued-to");
  const email = getArg(args, "--email");
  const privateKeyPath = getArg(args, "--private-key");
  const outputPath = getArg(args, "--output");

  if (!edition) {
    throw new Error("--edition is required");
  }
  if (!["standard", "professional", "enterprise"].includes(edition)) {
    throw new Error(
      `invalid edition "${edition}". Must be standard, professional, or enterprise`,
    );
  }
  if (!issuedTo) {
    throw new Error("--issued-to is required");
  }
  if (!email) {
    throw new Error("--email is required");
  }
  if (!privateKeyPath) {
    throw new Error("--private-key is required");
  }

  // All argument validation happens before any key material is touched.
  const maxUsers = parseSeatCount(getArg(args, "--max-users"));
  const licenseType = normalizeLicenseType(getArg(args, "--license-type"));
  const validUntil = normalizeValidUntil(getArg(args, "--valid-until"));
  assertExpiryForType(licenseType, validUntil);

  const features = featuresStr
    ? featuresStr
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];
  const licenseId = `LCE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${generateId(6)}`;

  const payload = {
    licenseId,
    issuedAt: new Date().toISOString(),
    issuedTo,
    email,
    edition,
    maxUsers,
    validFrom: new Date().toISOString(),
    licenseType,
  };
  if (features.length > 0) {
    payload.features = features;
  }
  if (validUntil) {
    payload.validUntil = validUntil;
  }

  let signingKey;
  try {
    signingKey = createPrivateKey(readFileSync(privateKeyPath, "utf8"));
  } catch (error) {
    throw new Error(
      `cannot read the Ed25519 private key at ${privateKeyPath}: ${error.message}`,
    );
  }

  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = ed25519Sign(null, payloadBytes, signingKey);
  const license = `${base64Url(payloadBytes)}.${base64Url(signature)}`;

  // Summary is human-facing; keep it on stderr so stdout is exactly the license.
  process.stderr.write(
    `Generated license:\n  ID: ${licenseId}\n  Edition: ${edition}\n  Customer: ${issuedTo}\n  Type: ${licenseType}\n  Expires: ${validUntil ?? "never (perpetual)"}\n`,
  );

  if (outputPath) {
    writeFileSync(outputPath, `${license}\n`, "utf8");
    process.stderr.write(
      `Signed license written to ${outputPath}\nSend this file to the customer; they activate it in Settings → License.\n`,
    );
  } else {
    process.stdout.write(`${license}\n`);
  }

  return 0;
}

const isMain =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].replace(/\\/g, "/").endsWith("generate-license.mjs"));

if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
