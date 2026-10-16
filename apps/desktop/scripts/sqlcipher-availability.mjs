import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The SQLCipher fork's runtime loader
 * (`better-sqlite3-sqlcipher/lib/database.js`) does
 * `require("../build/better_sqlite3.node")`. The fork's
 * `place_resulting_binaries` gyp target copies the built addon into `build/`,
 * NOT into `build/Release/` — `build/Release/better_sqlite3.node` is *plain*
 * better-sqlite3's layout. Checking the plain path reported a working SQLCipher
 * binding as missing and forced the silent plaintext fallback (#402).
 */
export const SQLCIPHER_ADDON_RELATIVE_PATH = path.join("build", "better_sqlite3.node");

/**
 * The Windows addon links libcrypto through an import library, so the gyp
 * target also copies `libeay32.dll` next to the addon; it must travel with the
 * binding or the addon fails to load.
 */
export const SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH = path.join("build", "libeay32.dll");

/** Files a loadable SQLCipher binding needs, relative to its package root. */
export const requiredSqlcipherFiles = (platform = process.platform) =>
  platform === "win32"
    ? [SQLCIPHER_ADDON_RELATIVE_PATH, SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH]
    : [SQLCIPHER_ADDON_RELATIVE_PATH];

/**
 * Decide whether a `better-sqlite3-sqlcipher` package directory contains a
 * loadable native binding. Pure: all filesystem access is injected.
 *
 * @param {object} options
 * @param {string} options.packageDir - Resolved `better-sqlite3-sqlcipher` root.
 * @param {NodeJS.Platform} [options.platform]
 * @param {(candidate: string) => boolean} [options.exists]
 * @returns {{ available: boolean, binaryPath: string, missing: string[] }}
 */
export const inspectSqlcipherArtifact = ({
  packageDir,
  platform = process.platform,
  exists = existsSync,
}) => {
  const missing = requiredSqlcipherFiles(platform).filter(
    (relativePath) => !exists(path.join(packageDir, relativePath)),
  );

  return {
    available: missing.length === 0,
    binaryPath: path.join(packageDir, SQLCIPHER_ADDON_RELATIVE_PATH),
    missing,
  };
};

/**
 * Resolve the SQLCipher package's availability, attempting the native build
 * once when the binding is missing.
 *
 * The build is skipped for a waived ephemeral run (`--allow-plaintext
 * --ephemeral`, i.e. `typecheck`): that path never publishes a runtime and the
 * waiver already covers a missing binding, so driving node-gyp there makes
 * every desktop typecheck pay for a native build it does not need (#409). A
 * waived *publishing* run still attempts the build, so a plaintext artifact is
 * only produced after the binding genuinely could not be built.
 *
 * `buildNative` and `exists` are injected so the decision — including that the
 * build callback is never invoked on the skipped path — is unit-testable
 * without a C++ toolchain.
 *
 * @param {object} options
 * @param {string} options.packageDir - Resolved `better-sqlite3-sqlcipher` root.
 * @param {NodeJS.Platform} [options.platform]
 * @param {boolean} [options.plaintextAllowed] - The waiver is active.
 * @param {boolean} [options.ephemeral] - This run publishes nothing.
 * @param {(candidate: string) => boolean} [options.exists]
 * @param {() => void} options.buildNative - Drives node-gyp for the fork.
 * @param {(message: string) => void} [options.log]
 * @returns {{ availability: object, attemptedBuild: boolean, detail: string | undefined }}
 */
export const resolveSqlcipherArtifact = ({
  packageDir,
  platform = process.platform,
  plaintextAllowed = false,
  ephemeral = false,
  exists = existsSync,
  buildNative,
  log = console.log,
}) => {
  const inspect = () => inspectSqlcipherArtifact({ packageDir, platform, exists });
  let availability = inspect();

  if (availability.available) {
    log(`better-sqlite3-sqlcipher native binding found at ${availability.binaryPath}.`);
    return { availability, attemptedBuild: false, detail: undefined };
  }

  const missing = availability.missing.join(", ");

  if (plaintextAllowed && ephemeral) {
    log(
      `better-sqlite3-sqlcipher native binding missing (${missing}); skipping the native `
      + "build for the waived ephemeral run, which never publishes a runtime.",
    );
    return { availability, attemptedBuild: false, detail: undefined };
  }

  log(`better-sqlite3-sqlcipher native binding missing (${missing}); attempting to build it.`);

  let detail;
  try {
    buildNative();
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  return { availability: inspect(), attemptedBuild: true, detail };
};

/**
 * The probe that proves the addon is a *loadable* SQLCipher build. Existence is
 * not proof: an addon built against a different Node ABI cannot be loaded by
 * the bundled Node, and plain better-sqlite3 accepts `PRAGMA key` as a no-op
 * and reports no cipher version. A real load plus a non-empty
 * `PRAGMA cipher_version` therefore shows the binding is real SQLCipher rather
 * than a no-op — it does NOT prove that a keyed write actually encrypts the
 * file. That is proven only by the #410 CI job (native fork build, keyed write,
 * assert the file is not `SQLite format 3`, reopen and read). This is the same
 * capability probe the API applies at runtime (#402/#409).
 *
 * Run with `node -e`, so `require("better-sqlite3-sqlcipher")` resolves from
 * the sidecar root's `node_modules` via the process working directory.
 */
export const SQLCIPHER_PROBE_SOURCE = [
  'const Database = require("better-sqlite3-sqlcipher");',
  'const db = new Database(":memory:");',
  "try {",
  '  db.pragma("key = \'tuari-build-probe\'");',
  '  db.pragma("cipher_compatibility = 4");',
  '  const version = db.pragma("cipher_version", { simple: true });',
  '  if (typeof version !== "string" || version.trim() === "") {',
  '    console.error("PRAGMA cipher_version returned no version");',
  "    process.exit(3);",
  "  }",
  "  process.stdout.write(String(version));",
  "} finally {",
  "  db.close();",
  "}",
].join("\n");

/**
 * Load the copied SQLCipher package with the Node executable that will ship
 * beside it and require a cipher version. Throws with the loader's own error
 * when the addon cannot load, so a stale/incompatible artifact fails the build
 * (or the installer smoke check) instead of surfacing on a customer machine.
 *
 * @param {object} options
 * @param {string} options.nodeExecPath - The bundled Node executable.
 * @param {string} options.runtimeDir - Sidecar root; holds `node_modules`.
 * @param {(file: string, args: string[], options: object) => string} [options.execFile]
 *   Injection seam; defaults to `execFileSync`.
 * @returns {string} the reported cipher version.
 */
export const probeSqlcipherBinding = ({
  nodeExecPath,
  runtimeDir,
  execFile = execFileSync,
}) => {
  let stdout;
  try {
    stdout = execFile(nodeExecPath, ["-e", SQLCIPHER_PROBE_SOURCE], {
      cwd: runtimeDir,
      encoding: "utf8",
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
