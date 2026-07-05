/**
 * UpdateService — Business Authority responsibility (M4).
 *
 * Provides update metadata for the updater engine and frontend.
 * The actual download and verification is handled by the Rust Updater Engine;
 * this service only serves the metadata that tells the engine what to fetch.
 */
import type { UpdateMetadata } from "@tuari/contracts";

/** Safe integer parser from env var. Returns `undefined` on missing/invalid input. */
function parseEnvInt(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : undefined;
}

// ─── Default metadata ───────────────────────────────────────────
// In production these values come from environment variables or a
// remote update server.  Defaults let the endpoint be functional
// end-to-end during development.

function createDefaultMetadata(): UpdateMetadata {
  return {
    latestVersion: process.env.TUARI_APP_VERSION ?? "0.1.0",
    minSupportedVersion: "0.1.0",
    releaseDate: new Date().toISOString(),
    downloadUrl:
      process.env.TUARI_UPDATE_DOWNLOAD_URL ??
      "https://releases.tuari.app/update-package.tar.gz",
    checksumSha256:
      process.env.TUARI_UPDATE_CHECKSUM ??
      "0000000000000000000000000000000000000000000000000000000000000000",
    isCritical: process.env.TUARI_UPDATE_IS_CRITICAL === "true",
    releaseNotesUrl: process.env.TUARI_UPDATE_RELEASE_NOTES_URL || undefined,
    updatePackageSize: parseEnvInt(process.env.TUARI_UPDATE_PACKAGE_SIZE),
    changelog: process.env.TUARI_UPDATE_CHANGELOG || undefined,
  };
}

export class UpdateService {
  /**
   * Return the latest available update metadata.
   * The timestamp is refreshed on every call.
   */
  getLatestMetadata(): UpdateMetadata {
    return createDefaultMetadata();
  }
}
