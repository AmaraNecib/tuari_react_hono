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
