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

import {
  createPrivateKey,
  createPublicKey,
  sign as ed25519Sign,
} from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LICENSE_TYPES = ["perpetual", "subscription", "trial"];

// Seat counts round-trip through Rust `u32` (`max_users`). A larger value
// wraps in the app, and a wrapped 0 reads as "unlimited".
const MAX_SEATS = 4294967295; // u32::MAX

// Public half of the vendor signing key, copied from
// apps/desktop/src-tauri/src/license.rs (EMBEDDED_PUBLIC_KEY). It is public by
// design; the "script anchor matches the Rust embedded key" test fails if the
// two copies drift.
export const PRODUCTION_PUBLIC_KEY = Buffer.from(
  "ecc4536d478374bd65c033532ce12d2c83cb502f7211bc93e14107da97f8928b",
  "hex",
);

// The app's Rust verifier uses chrono's parse_from_rfc3339, so a bare or
// impossible date is rejected there and silently becomes a perpetual license.
// Capture the fields so the exact date that gets signed is validated.
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function assertCalendarDate(value, year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`--valid-until is not a real calendar date: "${value}"`);
  }
}

/// Derive the raw 32-byte Ed25519 public key from a private key object.
export function rawPublicKey(privateKey) {
  const spki = createPublicKey(privateKey).export({
    type: "spki",
    format: "der",
  });
  return Buffer.from(spki.subarray(spki.length - 32));
}

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
  if (parsed > MAX_SEATS) {
    throw new Error(
      `--max-users must be at most ${MAX_SEATS} (the app stores seats as a 32-bit unsigned integer; a larger value wraps and reads as unlimited), got "${value}"`,
    );
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

  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    assertCalendarDate(
      value,
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    );
    return `${value}T00:00:00Z`;
  }

  const rfc = RFC3339_RE.exec(value);
  if (rfc) {
    assertCalendarDate(value, Number(rfc[1]), Number(rfc[2]), Number(rfc[3]));
    if (Number(rfc[4]) > 23) {
      throw new Error(`--valid-until has an out-of-range hour: "${value}"`);
    }
    if (Number(rfc[5]) > 59) {
      throw new Error(`--valid-until has an out-of-range minute: "${value}"`);
    }
    if (Number(rfc[6]) > 60) {
      throw new Error(`--valid-until has an out-of-range second: "${value}"`);
    }
    if (
      rfc[7] !== undefined &&
      (Number(rfc[7]) > 23 || Number(rfc[8]) > 59)
    ) {
      throw new Error(`--valid-until has an out-of-range UTC offset: "${value}"`);
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
  --max-users <number>   Max user accounts, 0 = unlimited (default: 1).
                         Must fit in 32 bits; larger values wrap.
  --license-type <type>  perpetual, subscription, trial (default: perpetual)
  --valid-until <date>   Expiry as RFC 3339 (2027-01-01T00:00:00Z) or a date
                         (2027-01-01). Required for subscription/trial.
  --issued-to <string>   Customer name (required)
  --email <string>       Customer email (required)
  --private-key <path>   Path to Ed25519 private key file (required)
  --output <path>        Output file path (default: stdout)
  --allow-nonproduction-key  Sign with a key that is not the app's embedded
                         anchor. Tests and dev builds only; the app rejects
                         such a license.
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
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(
      `${name} requires a value (got ${value === undefined ? "nothing" : `the flag "${value}"`})`,
    );
  }
  return value;
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
  if (signingKey.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `--private-key must be an Ed25519 private key, got ${signingKey.asymmetricKeyType ?? "an unknown key type"}`,
    );
  }

  // The app only trusts PRODUCTION_PUBLIC_KEY, so a license signed with any
  // other key can never activate. Fail closed; tests and dev builds opt out
  // explicitly.
  const derivedPublicKey = rawPublicKey(signingKey);
  if (
    !args.includes("--allow-nonproduction-key") &&
    !derivedPublicKey.equals(PRODUCTION_PUBLIC_KEY)
  ) {
    throw new Error(
      `the supplied private key is not the production license key: its public key ${derivedPublicKey.toString("hex")} does not match the anchor embedded in the app. Pass --allow-nonproduction-key only for tests or dev builds.`,
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
    // The license carries the customer's name, email, and a transferable
    // value. Keep it owner-only; chmod covers a pre-existing file whose mode
    // writeFileSync would otherwise leave untouched.
    writeFileSync(outputPath, `${license}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(outputPath, 0o600);
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
