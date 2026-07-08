import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the current app version.
 *
 * Precedence:
 * 1. `process.env.TUARI_APP_VERSION` (set at deploy-time)
 * 2. `version` field in the API's `package.json` (dev / local)
 * 3. `"0.0.0"` fallback
 */
export function readAppVersion(): string {
  if (process.env.TUARI_APP_VERSION) {
    return process.env.TUARI_APP_VERSION;
  }

  try {
    // Resolve the API package.json — this file lives at
    // apps/api/src/modules/version.ts, so we go up 2 levels.
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
