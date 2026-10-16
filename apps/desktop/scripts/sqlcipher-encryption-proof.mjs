#!/usr/bin/env node
/**
 * sqlcipher-encryption-proof.mjs — prove the BUILT sidecar runtime encrypts.
 *
 * `build-sidecar.mjs` proves the copied SQLCipher binding *loads* and reports a
 * `PRAGMA cipher_version` (#402/#409). That is not the same claim as "a keyed
 * write produces a file that is not a plaintext SQLite database", and it is not
 * the same claim as "the daily backup is encrypted too". This script proves the
 * three claims end to end, against the runtime that would ship:
 *
 *   1. the built runtime holds a loadable SQLCipher binding (cipher_version
 *      non-empty, probed with the bundled `node.exe`);
 *   2. a keyed open + write + close leaves a file that is NOT plaintext (it does
 *      not start with the SQLite magic), and reopening it WITH the key reads the
 *      row back — a plain better-sqlite3 build accepts `PRAGMA key` as a no-op
 *      and would fail step 1, so the two together rule out the silent-plaintext
 *      failure mode;
 *   3. the shipped runtime boots with `APP_DB_KEY`, and the REAL daily-backup
 *      path (`VACUUM INTO` on a worker connection, `backup.snapshot.ts`) writes
 *      a backup that is also non-plaintext and key-readable.
 *
 * Step 3 boots the artifact instead of re-implementing the backup: a copy of
 * `VACUUM INTO` here would be a second, drifting definition of "the daily
 * backup", and the point of this gate is to exercise the code that ships.
 *
 * Deliberately independent of the API's own plaintext predicate: a proof that
 * shared the predicate it is proving could not catch a bug in that predicate.
 *
 * Usage:
 *   node apps/desktop/scripts/sqlcipher-encryption-proof.mjs
 *   node apps/desktop/scripts/sqlcipher-encryption-proof.mjs --runtime <dir> --node <exe>
 *   node apps/desktop/scripts/sqlcipher-encryption-proof.mjs --keep
 *
 * Exit code 0 = every step passed. Exit code 1 = at least one step failed.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// `./sqlcipher-availability.mjs` is loaded lazily inside `runProof`: it ships
// with the desktop build, while everything above `runProof` is pure. Keeping it
// off the import path lets this module's helpers be unit-tested (and
// `--help` run) on a checkout with no native toolchain and no built runtime.
const loadSqlcipherHelpers = () => import("./sqlcipher-availability.mjs");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const DEFAULT_RUNTIME_DIR = path.join(REPO_ROOT, "apps", "desktop", "src-tauri", "bin", "api-runtime");
const DEFAULT_NODE_EXE = path.join(REPO_ROOT, "apps", "desktop", "src-tauri", "bin", "node.exe");

/** The 16 bytes every plaintext SQLite database starts with. */
export const SQLITE_HEADER_MAGIC = Buffer.from("SQLite format 3\u0000", "latin1");

/** Directory name of one daily backup: the period it covers (`YYYY-MM-DD`). */
export const BACKUP_DIRECTORY_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DATABASE_FILE_NAME = "tuari.sqlite";
const SIDECAR_ENTRY = path.join("dist", "index.cjs");
const SQLCIPHER_PACKAGE_DIR = path.join("node_modules", "better-sqlite3-sqlcipher");

const DEFAULT_HEALTH_TIMEOUT_MS = 90_000;
const DEFAULT_BACKUP_TIMEOUT_MS = 120_000;

// ─── pure helpers (unit-tested without a native toolchain) ─────────────────

/**
 * Read the first `length` bytes of a file. Returns a shorter buffer when the
 * file is shorter — an empty or truncated file must never read as "encrypted".
 */
export function readFileHeader(filePath, length = SQLITE_HEADER_MAGIC.length) {
  const buffer = Buffer.alloc(length);
  const descriptor = openSync(filePath, "r");
  try {
    const read = readSync(descriptor, buffer, 0, length, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Does this file start with the plaintext SQLite magic?
 *
 * A file shorter than the magic is NOT plaintext-SQLite (it cannot be a SQLite
 * database at all), which keeps `0 === "not plaintext"` from being read as
 * proof of encryption — callers must also require a non-empty file.
 */
export function isPlaintextSqliteFile(filePath) {
  const header = readFileHeader(filePath);
  return header.length === SQLITE_HEADER_MAGIC.length && header.equals(SQLITE_HEADER_MAGIC);
}

/**
 * Every path the proof needs before it can run. Listing them up front turns a
 * "the runtime is a plaintext build" failure into one clear message instead of
 * a stack trace from the deepest probe.
 */
export function requiredRuntimeFiles(runtimeDir, nodeExe) {
  return [
    nodeExe,
    path.join(runtimeDir, SIDECAR_ENTRY),
    path.join(runtimeDir, SQLCIPHER_PACKAGE_DIR, "package.json"),
  ];
}

/**
 * Newest daily-backup database under a backups root, or null.
 *
 * Mirrors the layout `backup.service.ts` writes: one `YYYY-MM-DD` folder per
 * run, holding `tuari.sqlite`. A non-dated folder is never a snapshot, so a
 * stray directory cannot satisfy the gate.
 */
export function findSnapshotDatabase(backupsRoot, { readdir = readdirSync } = {}) {
  if (!existsSync(backupsRoot)) return null;

  const folders = readdir(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_DIRECTORY_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const candidate = path.join(backupsRoot, folders[index], DATABASE_FILE_NAME);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export function parseArgs(argv) {
  const options = {
    runtimeDir: DEFAULT_RUNTIME_DIR,
    nodeExe: DEFAULT_NODE_EXE,
    keep: false,
    healthTimeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
    backupTimeoutMs: DEFAULT_BACKUP_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep") {
      options.keep = true;
      continue;
    }
    const value = argv[index + 1];
    switch (arg) {
      case "--runtime":
        options.runtimeDir = path.resolve(value);
        index += 1;
        break;
      case "--node":
        options.nodeExe = path.resolve(value);
        index += 1;
        break;
      case "--health-timeout-ms":
        options.healthTimeoutMs = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--backup-timeout-ms":
        options.backupTimeoutMs = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

export function usage() {
  return [
    "Prove the built sidecar runtime encrypts (SQLCipher cipher_version, keyed",
    "write, non-plaintext file, keyed read, keyed daily backup).",
    "",
    "Usage: node apps/desktop/scripts/sqlcipher-encryption-proof.mjs [options]",
    "",
    "  --runtime <dir>            Sidecar runtime root (default: src-tauri/bin/api-runtime)",
    "  --node <exe>               Bundled Node executable (default: src-tauri/bin/node.exe)",
    "  --health-timeout-ms <n>    How long to wait for /health (default: 90000)",
    "  --backup-timeout-ms <n>    How long to wait for the daily backup (default: 120000)",
    "  --keep                     Keep the temp workspace for inspection",
    "  -h, --help                 Show this help",
  ].join("\n");
}

// ─── probe sources (run by the BUNDLED node, cwd = runtime root) ───────────
// `require("better-sqlite3-sqlcipher")` resolves from the process cwd, so these
// load the same binding the shipped runtime loads.

const WRITE_ROW_PROBE_SOURCE = [
  'const Database = require("better-sqlite3-sqlcipher");',
  'const key = String(process.env.TUARI_PROOF_KEY || "").replace(/\'/g, "\'\'");',
  "const db = new Database(process.env.TUARI_PROOF_DB);",
  'db.pragma("key = \'" + key + "\'");',
  'db.pragma("cipher_compatibility = 4");',
  "try {",
  '  db.exec("CREATE TABLE IF NOT EXISTS proof (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");',
  '  db.prepare("INSERT INTO proof (marker) VALUES (?)").run(String(process.env.TUARI_PROOF_MARKER));',
  "} finally {",
  "  db.close();",
  "}",
].join("\n");

const READ_ROWS_PROBE_SOURCE = [
  'const Database = require("better-sqlite3-sqlcipher");',
  'const key = String(process.env.TUARI_PROOF_KEY || "").replace(/\'/g, "\'\'");',
  "const db = new Database(process.env.TUARI_PROOF_DB);",
  'db.pragma("key = \'" + key + "\'");',
  'db.pragma("cipher_compatibility = 4");',
  "try {",
  "  const rows = db.prepare(process.env.TUARI_PROOF_SQL).all();",
  "  process.stdout.write(JSON.stringify(rows));",
  "} finally {",
  "  db.close();",
  "}",
].join("\n");

// ─── process helpers ──────────────────────────────────────────────────────

function runBundledNode(nodeExe, runtimeDir, source, env) {
  const result = spawnSync(nodeExe, ["-e", source], {
    cwd: runtimeDir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`${nodeExe} could not be executed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(`${nodeExe} probe exited ${result.status}: ${stderr || "(no stderr)"}`);
  }

  return (result.stdout || "").trim();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function terminateTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGKILL");
}

async function waitForHealth(port, { timeoutMs, child, transcript }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`sidecar exited (${child.exitCode}) before answering /health\n${transcript()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet — keep polling until the deadline.
    }
    await delay(250);
  }
  throw new Error(`sidecar did not answer /health within ${timeoutMs}ms\n${transcript()}`);
}

async function waitForSnapshot(backupsRoot, { timeoutMs, child, transcript }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`sidecar exited (${child.exitCode}) before writing a daily backup\n${transcript()}`);
    }
    const found = findSnapshotDatabase(backupsRoot);
    if (found) return found;
    await delay(250);
  }
  throw new Error(
    `the shipped runtime did not take a daily backup within ${timeoutMs}ms\n${transcript()}`,
  );
}

function assertEncryptedDatabase(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label}: expected a database at ${filePath}, found none`);
  }
  const size = statSync(filePath).size;
  if (size < SQLITE_HEADER_MAGIC.length) {
    throw new Error(`${label}: ${filePath} is ${size} bytes — too small to be a database at all`);
  }
  if (isPlaintextSqliteFile(filePath)) {
    throw new Error(
      `${label}: ${filePath} starts with "${SQLITE_HEADER_MAGIC.toString("latin1")}" — it is a PLAINTEXT database`,
    );
  }
  return size;
}

// ─── the proof ────────────────────────────────────────────────────────────

export async function runProof(options, { log = console.log } = {}) {
  const { inspectSqlcipherArtifact, probeSqlcipherBinding } = await loadSqlcipherHelpers();
  const runtimeDir = options.runtimeDir;
  const nodeExe = options.nodeExe;
  const workspace = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-proof-"));

  const key = `proof-key-${randomBytes(24).toString("hex")}`;
  const marker = `roundtrip-${randomBytes(8).toString("hex")}`;
  const roundTripDb = path.join(workspace, "roundtrip.sqlite");
  const dataDir = path.join(workspace, "data");
  const backupsRoot = path.join(workspace, "backups");
  const liveDb = path.join(dataDir, DATABASE_FILE_NAME);
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(backupsRoot, { recursive: true });

  const results = [];
  let child = null;
  let transcriptBuffer = "";
  const transcript = () => (transcriptBuffer.length > 0 ? transcriptBuffer : "(no sidecar output)");

  try {
    log("[1/5] The built runtime holds a loadable SQLCipher binding");
    for (const required of requiredRuntimeFiles(runtimeDir, nodeExe)) {
      if (!existsSync(required)) {
        throw new Error(
          `missing ${required}. The sidecar was not built with the real SQLCipher dependency — `
          + "run `pnpm --filter @tuari/desktop sidecar:build` without --allow-plaintext.",
        );
      }
    }
    const availability = inspectSqlcipherArtifact({
      packageDir: path.join(runtimeDir, SQLCIPHER_PACKAGE_DIR),
      platform: process.platform,
    });
    if (!availability.available) {
      throw new Error(
        `the runtime's SQLCipher package is incomplete (missing ${availability.missing.join(", ")})`,
      );
    }
    results.push("runtime carries a complete better-sqlite3-sqlcipher package");

    log("[2/5] PRAGMA cipher_version is non-empty on that binding");
    // Single-sourced with the build's own probe: the build must not use a weaker
    // capability test than this gate.
    const cipherVersion = probeSqlcipherBinding({ nodeExecPath: nodeExe, runtimeDir });
    results.push(`cipher_version=${cipherVersion}`);

    log("[3/5] A keyed write + close leaves a NON-plaintext file");
    runBundledNode(nodeExe, runtimeDir, WRITE_ROW_PROBE_SOURCE, {
      TUARI_PROOF_DB: roundTripDb,
      TUARI_PROOF_KEY: key,
      TUARI_PROOF_MARKER: marker,
    });
    const roundTripSize = assertEncryptedDatabase(roundTripDb, "keyed write");
    results.push(`keyed write produced ${roundTripSize} encrypted bytes`);

    log("[4/5] Reopening WITH the key reads the row back");
    const readBack = JSON.parse(
      runBundledNode(nodeExe, runtimeDir, READ_ROWS_PROBE_SOURCE, {
        TUARI_PROOF_DB: roundTripDb,
        TUARI_PROOF_KEY: key,
        TUARI_PROOF_SQL: "SELECT marker FROM proof ORDER BY id",
      }) || "[]",
    );
    if (readBack.length !== 1 || readBack[0].marker !== marker) {
      throw new Error(`keyed reopen returned ${JSON.stringify(readBack)}, expected one row with marker=${marker}`);
    }
    results.push("keyed reopen returned the written row");

    log("[5/5] The shipped runtime boots with a key and its daily backup is encrypted too");
    const port = await freePort();
    child = spawn(nodeExe, [SIDECAR_ENTRY], {
      cwd: runtimeDir,
      env: {
        ...process.env,
        NODE_ENV: "development",
        API_HOST: "127.0.0.1",
        API_PORT: String(port),
        APP_DB_PATH: liveDb,
        APP_DB_KEY: key,
        APP_BACKUPS_ROOT: backupsRoot,
        // Strong generated secret: the app refuses a weak/placeholder one.
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => { transcriptBuffer += chunk.toString(); });
    child.stderr.on("data", (chunk) => { transcriptBuffer += chunk.toString(); });

    await waitForHealth(port, { timeoutMs: options.healthTimeoutMs, child, transcript });
    results.push("shipped runtime answered /health with a keyed database");

    const liveSize = assertEncryptedDatabase(liveDb, "sidecar database");
    const liveTables = JSON.parse(
      runBundledNode(nodeExe, runtimeDir, READ_ROWS_PROBE_SOURCE, {
        TUARI_PROOF_DB: liveDb,
        TUARI_PROOF_KEY: key,
        TUARI_PROOF_SQL: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      }) || "[]",
    );
    if (liveTables.length === 0) {
      throw new Error("the keyed sidecar database holds no tables — nothing was written under the key");
    }
    results.push(`sidecar wrote ${liveSize} encrypted bytes (${liveTables.length} tables, key-readable)`);

    const snapshot = await waitForSnapshot(backupsRoot, {
      timeoutMs: options.backupTimeoutMs,
      child,
      transcript,
    });
    const snapshotSize = assertEncryptedDatabase(snapshot, "daily backup");
    const snapshotTables = JSON.parse(
      runBundledNode(nodeExe, runtimeDir, READ_ROWS_PROBE_SOURCE, {
        TUARI_PROOF_DB: snapshot,
        TUARI_PROOF_KEY: key,
        TUARI_PROOF_SQL: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      }) || "[]",
    );
    if (snapshotTables.length === 0) {
      throw new Error("the keyed daily backup holds no tables — the backup is not key-readable");
    }
    results.push(`daily backup ${path.relative(backupsRoot, snapshot)} is ${snapshotSize} encrypted bytes (key-readable)`);

    return { cipherVersion, results };
  } finally {
    if (child) terminateTree(child);
    if (!options.keep) rmSync(workspace, { recursive: true, force: true });
    else log(`\nTemp workspace kept at ${workspace}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const started = Date.now();
  const { cipherVersion, results } = await runProof(options);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log("\nSQLCipher encryption proof PASSED");
  console.log(`  cipher_version: ${cipherVersion}`);
  for (const result of results) console.log(`  - ${result}`);
  console.log(`  (${seconds}s, runtime: ${options.runtimeDir})`);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((error) => {
    console.error("\nSQLCipher encryption proof FAILED");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
