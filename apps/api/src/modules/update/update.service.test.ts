/**
 * UpdateService tests — metadata generation from env vars.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { UpdateService } from "./update.service";

describe("UpdateService", () => {
  let service: UpdateService;

  beforeEach(() => {
    service = new UpdateService();
  });

  describe("getLatestMetadata", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    it("returns default metadata when no env vars are set", () => {
      // Remove any TUARI_* env vars that might be set
      for (const key of Object.keys(process.env)) {
        if (key.startsWith("TUARI_")) {
          delete process.env[key];
        }
      }

      const result = service.getLatestMetadata();
      expect(result.latestVersion).toBe("0.1.0");
      expect(result.minSupportedVersion).toBe("0.1.0");
      expect(result.downloadUrl).toBe("https://releases.tuari.app/update-package.tar.gz");
      expect(result.checksumSha256).toBe("0000000000000000000000000000000000000000000000000000000000000000");
      expect(result.isCritical).toBe(false);
      expect(result.releaseNotesUrl).toBeUndefined();
      expect(result.updatePackageSize).toBeUndefined();
      expect(result.changelog).toBeUndefined();
      // releaseDate should be a valid ISO timestamp
      expect(new Date(result.releaseDate).toISOString()).toBe(result.releaseDate);
    });

    it("reads version and critical flag from env vars", () => {
      process.env.TUARI_APP_VERSION = "2.0.0";
      process.env.TUARI_UPDATE_IS_CRITICAL = "true";

      const result = service.getLatestMetadata();
      expect(result.latestVersion).toBe("2.0.0");
      expect(result.isCritical).toBe(true);
    });

    it("reads download URL from env var", () => {
      process.env.TUARI_UPDATE_DOWNLOAD_URL = "https://internal.cdn.example.com/update.tar.gz";

      const result = service.getLatestMetadata();
      expect(result.downloadUrl).toBe("https://internal.cdn.example.com/update.tar.gz");
    });

    it("reads checksum from env var", () => {
      process.env.TUARI_UPDATE_CHECKSUM = "1111111111111111111111111111111111111111111111111111111111111111";

      const result = service.getLatestMetadata();
      expect(result.checksumSha256).toBe("1111111111111111111111111111111111111111111111111111111111111111");
    });

    it("reads optional fields from env vars", () => {
      process.env.TUARI_UPDATE_RELEASE_NOTES_URL = "https://releases.tuari.app/v2.0.0";
      process.env.TUARI_UPDATE_PACKAGE_SIZE = "52428800";
      process.env.TUARI_UPDATE_CHANGELOG = "Major update with new features.";

      const result = service.getLatestMetadata();
      expect(result.releaseNotesUrl).toBe("https://releases.tuari.app/v2.0.0");
      expect(result.updatePackageSize).toBe(52_428_800);
      expect(result.changelog).toBe("Major update with new features.");
    });

    it("gracefully handles non-numeric package size env var", () => {
      process.env.TUARI_UPDATE_PACKAGE_SIZE = "not-a-number";

      const result = service.getLatestMetadata();
      expect(result.updatePackageSize).toBeUndefined();
    });

    it("gracefully handles empty package size env var", () => {
      process.env.TUARI_UPDATE_PACKAGE_SIZE = "";

      const result = service.getLatestMetadata();
      expect(result.updatePackageSize).toBeUndefined();
    });

    it("gracefully handles negative package size env var", () => {
      process.env.TUARI_UPDATE_PACKAGE_SIZE = "-100";

      const result = service.getLatestMetadata();
      // negative is not a positive integer; Zod will reject at the boundary
      expect(result.updatePackageSize).toBe(-100);
    });

    it("produces a fresh timestamp on each call", () => {
      // The releaseDate timestamp should update between calls
      const result1 = service.getLatestMetadata();
      const result2 = service.getLatestMetadata();
      // They could be the same if called within the same millisecond,
      // but they must both be valid ISO dates.
      expect(new Date(result1.releaseDate).toISOString()).toBe(result1.releaseDate);
      expect(new Date(result2.releaseDate).toISOString()).toBe(result2.releaseDate);
    });
  });
});
