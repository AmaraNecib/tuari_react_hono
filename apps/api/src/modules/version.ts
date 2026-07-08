import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the fallback version from the API's `package.json`.
 *
 * Called once at module load and cached.  In production the env-var
 * branch of `readAppVersion()` is always taken, so this function
 * only matters during development.
 */
function resolvePackageJsonVersion(): string {
  try {
    // This file lives at apps/api/src/modules/version.ts, so we go up 2 levels.
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // File may not exist in bundled production
  }

  return "0.0.0";
}

/** Cached fallback version — resolved once via synchronous I/O. */
const _cachedFallbackVersion = resolvePackageJsonVersion();

/**
 * Return the current app version.
 *
 * - If `TUARI_APP_VERSION` is set (deploy-time), returns it immediately
 *   with no I/O.
 * - Otherwise returns the fallback resolved once at module load from
 *   `package.json` or `"0.0.0"`.
 *
 * The env-var check runs on every call (it is a cheap property lookup)
 * so tests can set `process.env.TUARI_APP_VERSION` before each test.
 */
export function readAppVersion(): string {
  if (process.env.TUARI_APP_VERSION) {
    return process.env.TUARI_APP_VERSION;
  }

  return _cachedFallbackVersion;
}
