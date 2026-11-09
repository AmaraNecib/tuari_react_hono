import { execFileSync } from "node:child_process";

/**
 * Probe the package through the bundled Node that ships beside it. The
 * availability check itself uses `assertSqlcipherPrebuild` from
 * `script-security-utils.mjs`, which follows the package's prebuild selector.
 */
export const SQLCIPHER_PROBE_SOURCE = [
  'const Database = require("better-sqlite3-multiple-ciphers");',
  'const fs = require("node:fs");',
  'const os = require("node:os");',
  'const path = require("node:path");',
  'const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-probe-"));',
  'const probeFile = path.join(probeDir, "probe.sqlite");',
  'let db;',
  "try {",
  '  db = new Database(probeFile);',
  '  db.pragma("cipher = \'sqlcipher\'");',
  '  db.pragma("legacy = 4");',
  '  db.pragma("key = \'tuari-build-probe\'");',
  '  const version = db.pragma("cipher_version", { simple: true });',
  '  if (typeof version !== "string" || version.trim() === "") {',
  '    throw new Error("PRAGMA cipher_version returned no version");',
  "  }",
  "  process.stdout.write(String(version));",
  "} finally {",
  '  try { db?.close(); } finally { fs.rmSync(probeDir, { recursive: true, force: true }); }',
  "}",
].join("\n");

/** Maximum time allowed for the bundled Node native-binding probe. */
export const SQLCIPHER_PROBE_TIMEOUT_MS = 30_000;

/**
 * Load the packaged binding with the bundled Node and require a nonempty
 * cipher_version. Prebuild selection and loading are checked separately by
 * `assertSqlcipherPrebuild` before this capability probe runs.
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
      `SQLCipher binding could not be loaded by ${nodeExecPath} from ${runtimeDir}: ${detail}`,
    );
  }

  const version = typeof stdout === "string" ? stdout.trim() : "";
  if (version === "") {
    throw new Error(
      `SQLCipher binding loaded by ${nodeExecPath} but reported no cipher_version; it cannot encrypt.`,
    );
  }
  return version;
};
