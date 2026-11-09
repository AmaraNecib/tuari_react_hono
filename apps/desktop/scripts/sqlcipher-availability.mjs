import { execFileSync } from "node:child_process";

/**
 * Exercise the packaged binding through bundled Node on a temporary file.
 * Acceptance of encryption still comes from the built-runtime proof, which
 * checks positive and negative readers against real database data.
 */
export const SQLCIPHER_PROBE_SOURCE = [
  'const Database = require("better-sqlite3-multiple-ciphers");',
  'const fs = require("node:fs");',
  'const os = require("node:os");',
  'const path = require("node:path");',
  'const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-probe-"));',
  'const probeFile = path.join(probeDir, "probe.sqlite");',
  'const key = "tuari-build-probe";',
  "let db;",
  "try {",
  '  db = new Database(probeFile);',
  '  db.pragma("cipher = \'sqlcipher\'");',
  '  db.pragma("legacy = 4");',
  '  db.pragma("key = \'" + key + "\'");',
  '  db.exec("CREATE TABLE probe (value TEXT NOT NULL)");',
  '  db.prepare("INSERT INTO probe VALUES (?)").run("binding-ready");',
  '  db.close(); db = null;',
  '  db = new Database(probeFile);',
  '  db.pragma("cipher = \'sqlcipher\'");',
  '  db.pragma("legacy = 4");',
  '  db.pragma("key = \'" + key + "\'");',
  '  const row = db.prepare("SELECT value FROM probe").get();',
  '  if (row?.value !== "binding-ready") throw new Error("keyed temporary-file readback failed");',
  '  process.stdout.write("keyed temporary-file readback passed");',
  "} finally {",
  '  try { db?.close(); } finally { fs.rmSync(probeDir, { recursive: true, force: true }); }',
  "}",
].join("\n");

/** Maximum time allowed for the bundled Node native-binding probe. */
export const SQLCIPHER_PROBE_TIMEOUT_MS = 30_000;

/**
 * Load and exercise the packaged binding with the bundled Node. The full
 * encryption proof checks wrong-key, no-key and plain-SQLite rejection.
 */
export const probeSqlcipherBinding = ({
  nodeExecPath,
  runtimeDir,
  execFile = execFileSync,
  timeoutMs = SQLCIPHER_PROBE_TIMEOUT_MS,
}) => {
  let stdout;
  try {
    stdout = execFile(nodeExecPath, ["-e", SQLCIPHER_PROBE_SOURCE], {
      cwd: runtimeDir,
      encoding: "utf8",
      timeout: timeoutMs,
    });
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    const detail = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `SQLite3MultipleCiphers binding could not complete a keyed file roundtrip in ${nodeExecPath} from ${runtimeDir}: ${detail}`,
    );
  }

  const result = typeof stdout === "string" ? stdout.trim() : "";
  if (result !== "keyed temporary-file readback passed") {
    throw new Error(
      `SQLite3MultipleCiphers binding in ${nodeExecPath} did not confirm its keyed file roundtrip.`,
    );
  }
  return result;
};
