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
/** The marker that makes a folder OURS, per `backup.service.ts`. */
const BACKUP_MARKER_FILE_NAME = "snapshot.json";
const SIDECAR_ENTRY = path.join("dist", "index.cjs");
const SQLCIPHER_PACKAGE_DIR = path.join("node_modules", "better-sqlite3-sqlcipher");

const DEFAULT_HEALTH_TIMEOUT_MS = 90_000;
const DEFAULT_BACKUP_TIMEOUT_MS = 120_000;
// Every `runBundledNode` probe talks to a native addon. A hung native call must
// not hold the job: without a bound, `spawnSync` never returns, the script never
// reaches its own error checks or cleanup, and the Windows runner stays
// occupied until GitHub cancels it. Same bound as `probeSqlcipherBinding`.
const BUNDLED_NODE_TIMEOUT_MS = 30_000;

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
 * Every asset the proof needs before it can run, each with what it is. Naming
 * them turns "the runtime is a plaintext build" into one clear message instead
 * of a stack trace from the deepest probe — and keeps a missing interpreter
 * from being reported as a missing SQLCipher build.
 */
export function requiredRuntimeFiles(runtimeDir, nodeExe) {
  return [
    { path: nodeExe, what: "the bundled Node runtime" },
    { path: path.join(runtimeDir, SIDECAR_ENTRY), what: "the built sidecar entry (dist/index.cjs)" },
    {
      path: path.join(runtimeDir, SQLCIPHER_PACKAGE_DIR, "package.json"),
      what: "the better-sqlite3-sqlcipher package",
    },
  ];
}

/**
 * Newest daily-backup database under a backups root, or null.
 *
 * Mirrors the layout the API owns: `backup.service.ts` / `backup.policy.ts`
 * write one `YYYY-MM-DD` folder per run holding `tuari.sqlite` plus the
 * `snapshot.json` marker, and treat only a marked folder as a snapshot. If that
 * layout changes, this returns null and the job goes red — the duplication
 * fails closed, which is the right failure for a gate.
 *
 * The duplicated names and the deliberately un-duplicated `SQLITE_HEADER_MAGIC`
 * are opposite answers to the same question. The magic is fixed by the SQLite
 * file format, so it cannot drift and there is nothing to gain by sharing it;
 * the folder layout is a project decision that can change, so this copy carries
 * real drift risk and is mitigated only by failing closed.
 */
export function findSnapshotDatabase(backupsRoot, { readdir = readdirSync } = {}) {
  if (!existsSync(backupsRoot)) return null;

  const folders = readdir(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_DIRECTORY_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const folder = path.join(backupsRoot, folders[index]);
    const candidate = path.join(folder, DATABASE_FILE_NAME);
    if (!existsSync(candidate)) continue;
    // A dated folder with a database file in it is not a backup. The marker is
    // what the app itself requires before it will call a folder ours.
    if (!existsSync(path.join(folder, BACKUP_MARKER_FILE_NAME))) continue;
    return candidate;
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

  // A flag whose value is missing (`--runtime` last, or followed by another
  // flag) would otherwise resolve to `undefined` or swallow the next flag; a
  // non-numeric timeout would become `NaN`, and `Date.now() < NaN` is false, so
  // the wait would fail instantly with a message about `NaNms`.
  const valueFor = (flag, value) => {
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    return value;
  };
  const timeoutFor = (flag, value) => {
    const raw = valueFor(flag, value);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${flag} needs a positive number of milliseconds, got "${raw}"`);
    }
    return parsed;
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
        options.runtimeDir = path.resolve(valueFor(arg, value));
        index += 1;
        break;
      case "--node":
        options.nodeExe = path.resolve(valueFor(arg, value));
        index += 1;
        break;
      case "--health-timeout-ms":
        options.healthTimeoutMs = timeoutFor(arg, value);
        index += 1;
        break;
      case "--backup-timeout-ms":
        options.backupTimeoutMs = timeoutFor(arg, value);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        // Any unrecognised argument is an error. A bare positional or a
        // single-dash typo (`-runtime ./x`, `--runtime=./x`) would otherwise be
        // ignored and the default used silently, which is how a gate ends up
        // proving a runtime the caller did not name.
        throw new Error(`Unknown option: ${arg}`);
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

// A structural guard in the unit suite asserts these two strings still apply
// the key: the keyed write is the guarantee #410 exists to make, and it is
// otherwise only observable on the Windows runner.
export const WRITE_ROW_PROBE_SOURCE = [
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

export const READ_ROWS_PROBE_SOURCE = [
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
    timeout: BUNDLED_NODE_TIMEOUT_MS,
  });

  if (result.error?.code === "ETIMEDOUT" || result.signal) {
    throw new Error(
      `${nodeExe} probe did not finish within ${BUNDLED_NODE_TIMEOUT_MS}ms (hung native call)`,
    );
  }
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

/**
 * A database file that exists, is a real file, is large enough to hold a
 * header, and does NOT start with the plaintext magic. Returns its size.
 *
 * The name says what it establishes: "not plaintext SQLite", not "encrypted" —
 * bytes that are not the magic are not proof of ciphertext, and the keyed
 * read-back is what closes that gap.
 *
 * Exported so the rejection paths (missing, directory, too small, plaintext)
 * are unit-tested: this is the enforcement point for steps 3 to 5.
 */
export function assertNotPlaintextDatabase(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label}: expected a database at ${filePath}, found none`);
  }
  // A mis-resolved runtime path is a directory or a special file. Say which,
  // rather than surfacing a raw EISDIR from somewhere deeper.
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(
      `${label}: expected a database at ${filePath}, found ${stats.isDirectory() ? "a directory" : "a special file"}`,
    );
  }
  const size = stats.size;
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
      if (!existsSync(required.path)) {
        const hint = required.path.includes(SQLCIPHER_PACKAGE_DIR)
          ? " The sidecar was not built with the real SQLCipher dependency — run"
            + " `pnpm --filter @tuari/desktop sidecar:build` without --allow-plaintext."
          : "";
        throw new Error(`missing ${required.what} at ${required.path}.${hint}`);
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
    const roundTripSize = assertNotPlaintextDatabase(roundTripDb, "keyed write");
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

    const liveSize = assertNotPlaintextDatabase(liveDb, "sidecar database");
    // One reader for both databases, so "the backup is a copy of the live
    // database" is a comparison of like with like.
    const keyedTableNames = (databasePath) =>
      JSON.parse(
        runBundledNode(nodeExe, runtimeDir, READ_ROWS_PROBE_SOURCE, {
          TUARI_PROOF_DB: databasePath,
          TUARI_PROOF_KEY: key,
          TUARI_PROOF_SQL: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        }) || "[]",
      ).map((row) => row.name);

    const liveTables = keyedTableNames(liveDb);
    if (liveTables.length === 0) {
      throw new Error("the keyed sidecar database holds no tables — nothing was written under the key");
    }
    results.push(`sidecar wrote ${liveSize} encrypted bytes (${liveTables.length} tables, key-readable)`);

    const snapshot = await waitForSnapshot(backupsRoot, {
      timeoutMs: options.backupTimeoutMs,
      child,
      transcript,
    });
    const snapshotSize = assertNotPlaintextDatabase(snapshot, "daily backup");
    const snapshotTables = keyedTableNames(snapshot);
    if (snapshotTables.length === 0) {
      throw new Error("the keyed daily backup holds no tables — the backup is not key-readable");
    }
    // The backup is a `VACUUM INTO` copy of the live database, so every table
    // the live database had at backup time must be present in the backup. A
    // table that is missing means the copy is not faithful.
    //
    // This is a schema check, not a data check: it cannot see a backup whose
    // tables exist but are empty, and it does not compare rows.
    //
    // Subset, not equality: `liveTables` is read once, and the snapshot may
    // include a table created between that read and the backup, so a backup
    // with *extra* tables is not a failure. A table that is missing from the
    // backup still is.
    //
    // It is deliberately schema-agnostic, so it cannot drift with a migration.
    const missingTables = liveTables.filter((table) => !snapshotTables.includes(table));
    if (missingTables.length > 0) {
      throw new Error(
        `the daily backup is not a faithful copy: it is missing [${missingTables.join(", ")}] `
        + `(the backup has [${snapshotTables.join(", ")}])`,
      );
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
