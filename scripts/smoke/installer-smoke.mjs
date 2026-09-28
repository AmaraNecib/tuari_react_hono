#!/usr/bin/env node
/**
 * installer-smoke.mjs — prove the BUILT desktop artifact actually runs.
 *
 * Every other gate in this repo tests source. This one tests the thing a
 * customer installs: it extracts the portable zip, checks the bundle declared
 * in tauri.conf.json is complete, launches the shipped Tuari.exe, and then
 * proves the API sidecar came up, answered /health, and wrote a SQLite
 * database into the portable data directory.
 *
 * What it proves (scripted, deterministic):
 *   1. Both release artifacts exist and are non-empty (portable zip, NSIS exe).
 *   2. The portable zip contains the app exe, the bundled Node runtime, and the
 *      api-runtime sidecar entry the Rust shell spawns.
 *   3. Every `bundle.resources` entry from tauri.conf.json is present.
 *   4. The SQLCipher fork is at its loader path and the bundled Node can load it
 *      and report a `cipher_version`. That proves the binding is loadable, not
 *      that a keyed write encrypts the file; the write/read-back proof is the
 *      #410 CI job (see docs/release-verification.md).
 *   5. Tuari.exe starts and leaves a `node.exe ... api-runtime/dist/index.cjs`
 *      child process alive.
 *   6. The sidecar received the runtime env the shell sets (API_HOST,
 *      API_PORT, APP_DB_PATH, TUARI_LICENSE_STATUS). Secrets are redacted.
 *   7. GET /health returns 200 with {"status":"ok"}.
 *   8. The data directory the app resolved holds a real SQLite database with
 *      the app schema, plus the license/clock runtime state.
 *   9. Cleanup: both processes are gone and the port is free again.
 *
 * What it cannot prove: the WebView2 render (login screen, splashscreen to
 * main-window reveal, IPC bridge). Those need a human looking at a screen.
 * See docs/release-verification.md.
 *
 * Usage:
 *   node scripts/smoke/installer-smoke.mjs
 *   node scripts/smoke/installer-smoke.mjs --zip path/to/Tuari-portable.zip
 *   node scripts/smoke/installer-smoke.mjs --extract-dir <existing dir> --keep
 *
 * Exit code 0 = every check passed. Exit code 1 = at least one check failed.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { probeSqlcipherBinding } from "../../apps/desktop/scripts/sqlcipher-availability.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const TAURI_CONF_PATH = path.join(REPO_ROOT, "apps", "desktop", "src-tauri", "tauri.conf.json");
const RUST_LIB_PATH = path.join(REPO_ROOT, "apps", "desktop", "src-tauri", "src", "lib.rs");
const BUNDLE_ROOT = path.join(REPO_ROOT, "apps", "desktop", "src-tauri", "target", "release", "bundle");
const SIDECAR_PROBE_PS1 = path.join(SCRIPT_DIR, "windows-sidecar-probe.ps1");

const REQUIRED_TABLES = ["user", "session", "account", "app_bootstrap_state", "employee"];
const EXTRACT_MARKER = ".tuari-smoke-extract";
const SIDECAR_ENV_KEYS = [
  "API_HOST",
  "API_PORT",
  "APP_DB_PATH",
  "DATABASE_URL",
  "TUARI_CONFIG_FILE",
  "TUARI_LICENSE_EDITION",
  "TUARI_LICENSE_STATUS",
  "TUARI_LICENSE_FEATURES",
  "TUARI_LICENSE_MAX_USERS",
];
const REDACTED_ENV_KEYS = new Set(["BETTER_AUTH_SECRET", "APP_DB_KEY"]);

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    zip: undefined,
    installer: undefined,
    extractDir: undefined,
    keep: false,
    force: false,
    timeoutMs: 90_000,
    healthPort: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep") {
      options.keep = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    const value = argv[index + 1];
    switch (arg) {
      case "--zip":
        options.zip = value;
        index += 1;
        break;
      case "--installer":
        options.installer = value;
        index += 1;
        break;
      case "--extract-dir":
        options.extractDir = value;
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--health-port":
        options.healthPort = Number.parseInt(value, 10);
        index += 1;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/smoke/installer-smoke.mjs [options]",
      "",
      "Options:",
      "  --zip <path>         Portable zip to extract (default: newest in bundle/portable)",
      "  --installer <path>   NSIS installer to verify (default: newest in bundle/nsis)",
      "  --extract-dir <path> Reuse a smoke-owned portable directory",
      "  --force              With --extract-dir, reset a non-empty smoke-owned directory",
      "  --health-port <n>    Override the API port (default: read from src/lib.rs)",
      "  --timeout-ms <n>     Sidecar/health wait budget (default: 90000)",
      "  --keep               Keep the temp extraction directory for inspection",
      "  -h, --help           Show this help",
    ].join("\n"),
  );
}

// ─── Check bookkeeping ─────────────────────────────────────────────────────

const checks = [];
// Removals to run if main() rejects, so a fatal error never leaves a temp
// extraction directory behind. The normal exit paths remove these themselves.
const fatalCleanups = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  const label = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` (${detail})` : "";
  if (ok) {
    console.log(`  [PASS] ${name}${suffix}`);
  } else {
    console.error(`  [FAIL] ${name}${suffix}`);
  }
}

function check(name, fn) {
  try {
    const detail = fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error.message);
  }
}

async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error.message);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Prints the standard result footer and returns the number of failed checks.
 * Called on every exit path so the script always reports what failed, including
 * when a preflight check aborts the run before launch.
 */
function printSummary() {
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} checks passed ===`);
  for (const entry of failed) {
    console.error(`  FAILED: ${entry.name} (${entry.detail})`);
  }
  return failed.length;
}

// ─── Small filesystem helpers ──────────────────────────────────────────────

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function describeFile(filePath) {
  const stats = statSync(filePath);
  return `${filePath} [${humanSize(stats.size)}]`;
}

function tailFile(filePath, lineCount) {
  try {
    return readFileSync(filePath, "utf8").trimEnd().split(/\r?\n/).slice(-lineCount);
  } catch (error) {
    return [`<could not read ${filePath}: ${error.message}>`];
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function newestMatching(dir, pattern) {
  if (!existsSync(dir)) return undefined;
  const matches = readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0];
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * Refuses `--extract-dir` targets where deleting `bin` or `data` would reach
 * outside the directory the operator named.
 */
function assertSafeExtractDir(dir) {
  const parsed = path.parse(dir);
  assert(
    parsed.root !== dir,
    `refusing to use a filesystem root as --extract-dir: ${dir}`,
  );
  assert(
    path.resolve(dir) !== path.resolve(os.homedir()),
    `refusing to use the home directory as --extract-dir: ${dir}`,
  );
  assert(
    path.resolve(dir) !== path.resolve(REPO_ROOT),
    `refusing to use the repository root as --extract-dir: ${dir}`,
  );
}

/**
 * Best-effort description of whatever holds a TCP port, used in the preflight
 * failure so the operator can stop the right thing. Returns undefined when the
 * owner cannot be identified.
 */
function describePortOwner(port) {
  if (process.platform === "win32") {
    const script = [
      `$connection = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
      "if ($connection) {",
      "  $process = Get-CimInstance Win32_Process -Filter \"ProcessId = $($connection.OwningProcess)\" -ErrorAction SilentlyContinue",
      "  if ($process) { Write-Output (\"pid $($process.ProcessId) $($process.Name): $($process.CommandLine)\") }",
      "  else { Write-Output (\"pid $($connection.OwningProcess) (process details unavailable)\") }",
      "}",
    ].join("\n");
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8" },
    );
    const detail = result.stdout?.trim();
    return detail ? detail : undefined;
  }

  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  const detail = result.stdout?.trim().split("\n").slice(1).join("; ");
  return detail ? detail : undefined;
}

// ─── Artifact + layout checks ──────────────────────────────────────────────

function assertPeFile(filePath, label) {
  const handle = openSync(filePath, "r");
  try {
    const header = Buffer.alloc(2);
    readSync(handle, header, 0, 2, 0);
    assert(header.toString("ascii") === "MZ", `${label} is not a Windows PE (missing MZ header)`);
  } finally {
    closeSync(handle);
  }
}

function assertSqliteFile(filePath, label) {
  const handle = openSync(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const read = readSync(handle, header, 0, 16, 0);
    assert(read === 16, `${label} is shorter than a SQLite header`);
    assert(
      header.toString("latin1") === "SQLite format 3\u0000",
      `${label} does not start with the SQLite magic header`,
    );
  } finally {
    closeSync(handle);
  }
}

/**
 * Resolve where the app puts its data.
 *
 * The Rust shell checks `has_portable_runtime_layout(exe_dir)` first: when
 * `<exe_dir>/bin/node.exe` and `<exe_dir>/bin/api-runtime/dist/index.cjs` both
 * exist it uses `<exe_dir>/data`, otherwise `%APPDATA%\com.tuari.desktop\Tuari`.
 * The portable bundle satisfies the first branch, so the smoke test gets a
 * hermetic data directory next to the extracted exe instead of the operator's
 * real install data.
 */
function resolveDataDir(exeDir) {
  const portableLayout =
    existsSync(path.join(exeDir, "bin", "node.exe")) &&
    existsSync(path.join(exeDir, "bin", "api-runtime", "dist", "index.cjs"));
  assert(portableLayout, "extracted bundle does not have the portable runtime layout");
  return path.join(exeDir, "data");
}

function readApiPortFromRust() {
  const source = readFileSync(RUST_LIB_PATH, "utf8");
  const match = source.match(/const API_PORT: u16 = (\d+);/);
  assert(match, `could not read API_PORT from ${RUST_LIB_PATH}`);
  return Number.parseInt(match[1], 10);
}

function extractZip(zipPath, destination) {
  mkdirSync(destination, { recursive: true });
  if (process.platform === "win32") {
    const script = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`;
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8" },
    );
    assert(result.status === 0, `Expand-Archive failed: ${result.stderr || result.status}`);
    return;
  }

  const result = spawnSync("unzip", ["-o", zipPath, "-d", destination], { encoding: "utf8" });
  assert(result.status === 0, `unzip failed: ${result.stderr || result.status}`);
}

// ─── Sidecar process + env probe ───────────────────────────────────────────

function probeSidecar(extractDir) {
  if (process.platform !== "win32") {
    return { sidecars: [], env: null, envError: "process inspection is only implemented for Windows" };
  }

  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SIDECAR_PROBE_PS1,
      "-ExtractDir",
      extractDir,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    return { sidecars: [], env: null, envError: result.stderr || `probe exited ${result.status}` };
  }

  try {
    const parsed = JSON.parse(result.stdout.trim());
    return {
      sidecars: Array.isArray(parsed.sidecars) ? parsed.sidecars : [],
      env: parsed.env ?? null,
      envError: parsed.envError ?? null,
    };
  } catch (error) {
    return { sidecars: [], env: null, envError: `probe output was not JSON: ${error.message}` };
  }
}

function describeEnv(env) {
  const lines = [];
  for (const key of SIDECAR_ENV_KEYS) {
    if (env[key] !== undefined) {
      lines.push(`      ${key}=${env[key]}`);
    }
  }
  for (const key of REDACTED_ENV_KEYS) {
    lines.push(`      ${key}=${env[key] !== undefined ? "<redacted, present>" : "<absent>"}`);
  }
  lines.push(`      all keys: ${Object.keys(env).sort().join(", ")}`);
  return lines.join("\n");
}

// ─── Network helpers ───────────────────────────────────────────────────────

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function fetchHealth(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status}` };
    }
    const body = await response.json();
    return { ok: body?.status === "ok", detail: JSON.stringify(body) };
  } catch (error) {
    const cause = error?.cause?.code ? ` (${error.cause.code})` : "";
    return { ok: false, detail: `${error.message}${cause}` };
  }
}

function killProcessTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rustApiPort = readApiPortFromRust();
  const healthPort = options.healthPort ?? rustApiPort;

  console.log("\n=== Tuari installer smoke test ===");
  console.log(`Repo root:   ${REPO_ROOT}`);
  console.log(`Platform:    ${process.platform} ${process.arch}`);
  console.log(`Health port: ${healthPort} (src/lib.rs says ${rustApiPort})`);

  // ── 1. Artifacts ─────────────────────────────────────────────────────────
  console.log("\n[1/7] Release artifacts");

  const zipPath = options.zip ?? newestMatching(path.join(BUNDLE_ROOT, "portable"), /^Tuari-portable.*\.zip$/i);
  const installerPath =
    options.installer ?? newestMatching(path.join(BUNDLE_ROOT, "nsis"), /\.exe$/i);

  check("portable zip exists", () => {
    assert(zipPath, `no portable zip found under ${path.join(BUNDLE_ROOT, "portable")}`);
    assert(existsSync(zipPath), `missing ${zipPath}`);
    assert(statSync(zipPath).size > 1_000_000, `${zipPath} is suspiciously small`);
    return describeFile(zipPath);
  });

  check("portable zip sha256", () => {
    assert(zipPath && existsSync(zipPath), "portable zip unavailable");
    return sha256(zipPath);
  });

  check("NSIS installer exists and is a PE", () => {
    assert(installerPath, `no installer found under ${path.join(BUNDLE_ROOT, "nsis")}`);
    assert(existsSync(installerPath), `missing ${installerPath}`);
    assertPeFile(installerPath, "NSIS installer");
    return describeFile(installerPath);
  });

  check("NSIS installer sha256", () => {
    assert(installerPath && existsSync(installerPath), "installer unavailable");
    return sha256(installerPath);
  });

  if (!zipPath || !existsSync(zipPath)) {
    throw new Error("cannot continue without a portable zip; run `pnpm --filter @tuari/desktop portable` first");
  }

  // ── 2. Extract ───────────────────────────────────────────────────────────
  console.log("\n[2/7] Extract and inspect bundle layout");

  const reuseExisting = Boolean(options.extractDir);
  const extractDir = options.extractDir
    ? path.resolve(options.extractDir)
    : path.join(os.tmpdir(), `tuari-smoke-${process.pid}-${Date.now()}`);
  const markerPath = path.join(extractDir, EXTRACT_MARKER);

  // Ownership rules for --extract-dir. The script only deletes inside a
  // directory it created, proved by the marker file it writes there. A
  // directory the operator named is never removed, even on the cleanup path.
  let resetReusedExtractDir = false;
  if (reuseExisting) {
    assertSafeExtractDir(extractDir);
    if (existsSync(extractDir)) {
      assert(
        statSync(extractDir).isDirectory(),
        `--extract-dir ${extractDir} exists but is not a directory`,
      );
    } else {
      mkdirSync(extractDir, { recursive: true });
    }
    if (readdirSync(extractDir).length > 0) {
      assert(
        existsSync(markerPath),
        `--extract-dir ${extractDir} is not empty and has no ${EXTRACT_MARKER} marker, so this script cannot prove it owns it. Point --extract-dir at a new or empty directory, or remove that one yourself. --force does not override this.`,
      );
      assert(
        options.force,
        `--extract-dir ${extractDir} already holds a previous smoke extraction. Pass --force to reset the smoke artifacts inside it, or choose a new directory.`,
      );
      resetReusedExtractDir = true;
    }
  } else {
    mkdirSync(extractDir, { recursive: true });
  }

  if (resetReusedExtractDir) {
    // Every path below is joined onto extractDir, so nothing outside the
    // directory the operator named is ever touched.
    for (const name of ["Tuari.exe", "bin", "data"]) {
      rmSync(path.join(extractDir, name), { recursive: true, force: true });
    }
    console.log(`  [note] --force: reset the previous extraction in ${extractDir}`);
  }

  writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        createdBy: "scripts/smoke/installer-smoke.mjs",
        zip: zipPath,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  extractZip(zipPath, extractDir);

  const shouldCleanExtractDir = !reuseExisting && !options.keep;
  if (shouldCleanExtractDir) {
    // Registered so a fatal error later in the run still removes the temp dir.
    fatalCleanups.push(() => rmSync(extractDir, { recursive: true, force: true }));
  }

  const exePath = path.join(extractDir, "Tuari.exe");
  const nodePath = path.join(extractDir, "bin", "node.exe");
  const dataDir = resolveDataDir(extractDir);
  const dbPath = path.join(dataDir, "projects", "default", "tuari.sqlite");

  check("portable zip contains Tuari.exe", () => {
    assert(existsSync(exePath), `missing ${exePath}`);
    assert(statSync(exePath).size > 1_000_000, `${exePath} is suspiciously small`);
    assertPeFile(exePath, "Tuari.exe");
    return describeFile(exePath);
  });

  check("bundled Node runtime is present", () => {
    assert(existsSync(nodePath), `missing ${nodePath}`);
    assert(statSync(nodePath).size > 1_000_000, `${nodePath} is suspiciously small`);
    return describeFile(nodePath);
  });

  const sidecarDir = path.join(extractDir, "bin", "api-runtime");
  const sidecarEntry = path.join(sidecarDir, "dist", "index.cjs");

  check("api-runtime sidecar entry is present", () => {
    assert(existsSync(sidecarEntry), `missing ${sidecarEntry}`);
    assert(statSync(sidecarEntry).size > 10_000, `${sidecarEntry} is suspiciously small`);
    return describeFile(sidecarEntry);
  });

  check("plain better-sqlite3 native binding is present", () => {
    const candidate = path.join(
      sidecarDir,
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    );
    assert(
      existsSync(candidate),
      `missing ${candidate}; the sidecar cannot open its unencrypted database`,
    );
    return describeFile(candidate);
  });

  // The fork's loader requires `../build/better_sqlite3.node`; `build/Release`
  // is PLAIN better-sqlite3's layout. Checking only the plain package (always
  // copied now) would pass on an artifact that cannot encrypt (#402/#409).
  check("SQLCipher native binding is present at the fork's loader path", () => {
    const candidate = path.join(
      sidecarDir,
      "node_modules",
      "better-sqlite3-sqlcipher",
      "build",
      "better_sqlite3.node",
    );
    assert(
      existsSync(candidate),
      `missing ${candidate}; the release artifact would ship without encryption support`,
    );
    return describeFile(candidate);
  });

  // Presence is not capability: load the copied fork with the copied Node and
  // require a real cipher version (the runtime probe from #402).
  check("bundled Node loads the SQLCipher binding and reports a cipher version", () => {
    const version = probeSqlcipherBinding({ nodeExecPath: nodePath, runtimeDir: sidecarDir });
    return `cipher_version ${version}`;
  });

  check("every tauri.conf.json bundle.resources entry is in the bundle", () => {
    const config = readJson(TAURI_CONF_PATH);
    const resources = config?.bundle?.resources ?? [];
    assert(resources.length > 0, "tauri.conf.json declares no bundle.resources");
    const missing = resources.filter((resource) => !existsSync(path.join(extractDir, resource)));
    assert(missing.length === 0, `missing declared resource(s): ${missing.join(", ")}`);
    return resources.join(", ");
  });

  // ── 3. Pre-flight ────────────────────────────────────────────────────────
  console.log("\n[3/7] Pre-flight");

  const preflightStart = checks.length;

  await checkAsync(`port ${healthPort} is free before launch`, async () => {
    const free = await isPortFree(healthPort);
    if (!free) {
      const owner = describePortOwner(healthPort);
      throw new Error(
        `port ${healthPort} is already in use${owner ? ` by ${owner}` : " by an unidentified process"}; stop it and retry`,
      );
    }
    return "free";
  });

  check("data directory is clean before launch", () => {
    assert(!existsSync(dbPath), `${dbPath} already exists; use a fresh --extract-dir for a real first-run check`);
    return dataDir;
  });

  const preflightFailures = checks.slice(preflightStart).filter((entry) => !entry.ok);
  if (preflightFailures.length > 0) {
    // A busy port means another Tuari instance may own the API, and launching
    // this build would let its stale-sidecar cleanup kill that instance's
    // sidecar. Abort with nothing started.
    console.error(
      `\nAborting before launch: ${preflightFailures.length} preflight check(s) failed. The app was not started.`,
    );
    if (shouldCleanExtractDir) {
      rmSync(extractDir, { recursive: true, force: true });
    } else {
      console.log(`Extraction kept at ${extractDir}`);
    }
    return printSummary() === 0 ? 0 : 1;
  }

  // The shell copies an allowlisted legacy database from `%PUBLIC%\Documents\Tuari`
  // into the data dir on launch, preserving mtime, so a database left by an
  // earlier install would mask a real first run. Point PUBLIC at a directory
  // that does not exist for this launch: `resolve_legacy_tuari_dir` then finds
  // no legacy root and skips the migration. The freshness check in step 6 also
  // guards against this, so a future shell change cannot turn it back into a
  // false pass.
  const legacyGuardPublicDir = path.join(os.tmpdir(), `tuari-smoke-nolegacy-${process.pid}`);
  console.log(`  [note] legacy migration neutralized: launching with PUBLIC=${legacyGuardPublicDir}`);

  // ── 4. Launch ────────────────────────────────────────────────────────────
  console.log("\n[4/7] Launch the app and wait for the sidecar");

  const serverLogPath = path.join(dataDir, "logs", "api-server.log");
  const runStartedAt = Date.now();
  let databaseCreatedByThisRun = false;

  let appProcess = null;
  let sidecarPids = [];
  let sidecarEnv = null;
  let sidecarEnvError = null;
  let appExitCode = null;

  try {
    appProcess = spawn(exePath, [], {
      cwd: extractDir,
      stdio: "ignore",
      env: { ...process.env, PUBLIC: legacyGuardPublicDir },
    });
    record("Tuari.exe started", true, `pid ${appProcess.pid}`);
  } catch (error) {
    record("Tuari.exe started", false, error.message);
  }

  let probe = { sidecars: [], env: null, envError: null };
  if (appProcess) {
    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline) {
      probe = probeSidecar(extractDir);
      if (probe.sidecars.length > 0) {
        break;
      }
      if (appProcess.exitCode !== null) {
        appExitCode = appProcess.exitCode;
        break;
      }
      await delay(1000);
    }
  }

  sidecarPids = probe.sidecars.map((entry) => entry.pid);
  sidecarEnv = probe.env;
  sidecarEnvError = probe.envError;

  record(
    "API sidecar process is running",
    sidecarPids.length > 0,
    sidecarPids.length > 0
      ? `pid(s) ${sidecarPids.join(", ")}`
      : appExitCode !== null
        ? `Tuari.exe exited with code ${appExitCode} before the sidecar appeared`
        : `no node.exe running ${path.join(extractDir, "bin", "api-runtime", "dist", "index.cjs")} within ${options.timeoutMs} ms`,
  );

  if (sidecarPids.length > 0) {
    console.log(`      command: ${probe.sidecars[0].commandLine}`);
    if (sidecarEnv) {
      console.log(describeEnv(sidecarEnv));
    } else {
      console.log(`      env not readable: ${sidecarEnvError}`);
    }
  } else if (existsSync(serverLogPath)) {
    // The sidecar writes its stdout/stderr here. When it died on startup this is
    // the only place the reason exists.
    console.error(`      api-server.log tail (${serverLogPath}):`);
    for (const line of tailFile(serverLogPath, 25)) {
      console.error(`      ${line}`);
    }
  }

  // ── 5. Health ────────────────────────────────────────────────────────────
  console.log("\n[5/7] API health endpoint");

  await checkAsync("GET /health returns {\"status\":\"ok\"}", async () => {
    const deadline = Date.now() + options.timeoutMs;
    let last = "no response";
    while (Date.now() < deadline) {
      const result = await fetchHealth(healthPort);
      if (result.ok) {
        return result.detail;
      }
      last = result.detail;
      await delay(1000);
    }
    throw new Error(`no healthy response within ${options.timeoutMs} ms (last: ${last})`);
  });

  if (sidecarEnv) {
    check("sidecar got the runtime env the Rust shell sets", () => {
      assert(
        sidecarEnv.API_PORT === String(rustApiPort),
        `API_PORT=${sidecarEnv.API_PORT} but src/lib.rs declares ${rustApiPort}`,
      );
      assert(sidecarEnv.API_HOST === "127.0.0.1", `API_HOST=${sidecarEnv.API_HOST}`);
      assert(
        sidecarEnv.APP_DB_PATH && path.resolve(sidecarEnv.APP_DB_PATH) === path.resolve(dbPath),
        `APP_DB_PATH=${sidecarEnv.APP_DB_PATH} does not match the portable data dir ${dbPath}`,
      );
      assert(sidecarEnv.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET was not passed to the sidecar");
      return "API_HOST, API_PORT, APP_DB_PATH, BETTER_AUTH_SECRET";
    });
  } else {
    record(
      "sidecar env is observable",
      false,
      sidecarPids.length === 0
        ? "the sidecar never started, so there is no environment block to read"
        : `could not read the child environment block: ${sidecarEnvError}. This check needs a same-user, non-elevated process read (Windows) or /proc (POSIX).`,
    );
  }

  // ── 6. Data dir + license ────────────────────────────────────────────────
  console.log("\n[6/7] Data directory, database, and license state");

  await checkAsync("SQLite database was created by this run in the portable data dir", async () => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (existsSync(dbPath) && statSync(dbPath).size > 0) {
        const stats = statSync(dbPath);
        // The shell migrates an allowlisted legacy database into the portable
        // data dir with `std::fs::copy`, which preserves the source mtime. A
        // file older than this run is a migrated legacy database, not proof
        // that the sidecar wrote anything.
        assert(
          stats.mtimeMs >= runStartedAt - 2000,
          `${dbPath} is older than this run (mtime ${new Date(stats.mtimeMs).toISOString()}); the app migrated a legacy database instead of creating a fresh one, so this run proves nothing. Remove the legacy data or run on a clean machine.`,
        );
        assertSqliteFile(dbPath, dbPath);
        databaseCreatedByThisRun = true;
        return `${describeFile(dbPath)}, mtime ${new Date(stats.mtimeMs).toISOString()}`;
      }
      await delay(500);
    }
    throw new Error(`${dbPath} was not created`);
  });

  check("clock tracker was written (Rust shell ran its license/clock init)", () => {
    const tracker = path.join(dataDir, "clock-tracker.json");
    assert(existsSync(tracker), `missing ${tracker}`);
    const parsed = readJson(tracker);
    assert(
      Number.isFinite(parsed.install_wall) && Number.isFinite(parsed.last_seen_wall),
      `${tracker} does not hold a clock tracker payload`,
    );
    return `install_wall=${parsed.install_wall}`;
  });

  check("no license file, so the app runs the no-license path", () => {
    const licensePath = path.join(dataDir, "license.lic");
    assert(!existsSync(licensePath), `${licensePath} exists; the smoke test expects a fresh unlicensed install`);
    return "absent";
  });

  check("license status handed to the sidecar", () => {
    // The Rust mapping is: no license file plus a fresh clock tracker means
    // LicenseStatus::Grace, which to_env_map() serializes as "trial"
    // (license.rs). When the env block is unreadable but the sidecar did start,
    // the fresh data dir still pins the expected value.
    if (sidecarEnv) {
      const status = sidecarEnv.TUARI_LICENSE_STATUS;
      const edition = sidecarEnv.TUARI_LICENSE_EDITION;
      // This run is a fresh unlicensed install, so the shell's
      // LicenseStatus::Grace is the only accepted handoff. `active` would mean
      // the shell found a license that this run never placed there.
      assert(
        status === "trial",
        `TUARI_LICENSE_STATUS=${status} (observed edition=${edition}); a fresh install with no license.lic must hand the sidecar exactly "trial" (Rust LicenseStatus::Grace)`,
      );
      return `TUARI_LICENSE_STATUS=${status}, TUARI_LICENSE_EDITION=${edition}`;
    }
    if (sidecarPids.length === 0) {
      throw new Error("the sidecar never started, so the license handoff never happened");
    }
    return "inferred trial (env not readable; fresh data dir, no license.lic, Rust maps Grace to \"trial\")";
  });

  // ── 7. Shutdown + schema ─────────────────────────────────────────────────
  console.log("\n[7/7] Shut down cleanly and verify the database schema");

  if (appProcess && appProcess.pid) {
    killProcessTree(appProcess.pid);
  }
  for (const pid of sidecarPids) {
    killProcessTree(pid);
  }

  const portFreed = await waitFor(async () => isPortFree(healthPort), 20_000);
  record("processes stopped and port released", portFreed, portFreed ? `port ${healthPort} free` : `port ${healthPort} still in use`);

  const leftover = probeSidecar(extractDir);
  record(
    "no sidecar process left behind",
    leftover.sidecars.length === 0,
    leftover.sidecars.length === 0 ? "none" : `pid(s) ${leftover.sidecars.map((s) => s.pid).join(", ")}`,
  );

  await checkAsync("database holds the app schema", async () => {
    if (!existsSync(dbPath)) {
      throw new Error(`${dbPath} disappeared`);
    }
    assert(
      databaseCreatedByThisRun,
      "the database was not created by this run (see the freshness check above), so its schema proves nothing",
    );
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(dbPath);
    try {
      database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const rows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      const names = rows.map((row) => row.name);
      const missing = REQUIRED_TABLES.filter((table) => !names.includes(table));
      assert(
        missing.length === 0,
        `database is missing table(s) ${missing.join(", ")}; found ${names.length} tables: ${names.slice(0, 12).join(", ")}`,
      );
      return `${names.length} tables incl. ${REQUIRED_TABLES.join(", ")}`;
    } finally {
      database.close();
    }
  });

  // ── Cleanup + summary ────────────────────────────────────────────────────
  if (shouldCleanExtractDir) {
    rmSync(extractDir, { recursive: true, force: true });
  } else {
    console.log(`\nExtraction kept at ${extractDir}`);
  }

  return printSummary() === 0 ? 0 : 1;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await delay(500);
  }
  return false;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`\nFatal error: ${error.message}`);
    for (const cleanup of fatalCleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        // Best effort: the fatal error is what matters.
      }
    }
    process.exitCode = 1;
  });
