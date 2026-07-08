/**
 * AppVersion — resolves the current application version.
 *
 * Priority:
 *   1. `TUARI_APP_VERSION` environment variable (set at deploy/CI time)
 *   2. `version` field in the API's package.json (development/fallback)
 *
 * The env-var-first pattern lets CI/CD pipelines pin the exact version
 * without touching source files, while the package.json fallback keeps
 * local development zero-config.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Read the API package version, returning `"0.0.0"` on error. */
function readPackageJsonVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(__dirname, "../../../package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    const { version } = JSON.parse(raw) as { version?: string };
    return version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Return the current application version string.
 *
 * Checks `TUARI_APP_VERSION` first; if unset, reads the `version` field
 * from the API's `package.json`.  The result is **not** cached so that
 * environment variable changes are reflected immediately — useful both
 * in tests and in long-running server processes that source updated env.
 */
export function resolveAppVersion(): string {
  return process.env.TUARI_APP_VERSION ?? readPackageJsonVersion();
}
