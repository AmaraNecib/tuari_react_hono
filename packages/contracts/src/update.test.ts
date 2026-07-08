import { describe, expect, it } from "vitest";
import {
  updateMetadataSchema,
  updateRecordSchema,
  recordUpdateInputSchema,
  updateHistoryListSchema,
} from "./update";

const validMetadata = {
  latestVersion: "1.2.3",
  minSupportedVersion: "1.0.0",
  releaseDate: "2026-07-05T12:00:00Z",
  downloadUrl: "https://releases.tuari.app/update-package.tar.gz",
  checksumSha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  isCritical: false,
};

describe("updateMetadataSchema", () => {
  it("accepts a complete metadata payload", () => {
    const result = updateMetadataSchema.parse(validMetadata);
    expect(result.latestVersion).toBe("1.2.3");
    expect(result.minSupportedVersion).toBe("1.0.0");
    expect(result.isCritical).toBe(false);
  });

  it("accepts metadata with all optional fields", () => {
    const withOptionals = {
      ...validMetadata,
      releaseNotesUrl: "https://releases.tuari.app/releases/v1.2.3",
      updatePackageSize: 42_000_000,
      changelog: "Bug fixes and performance improvements.",
    };
    const result = updateMetadataSchema.parse(withOptionals);
    expect(result.releaseNotesUrl).toBe(withOptionals.releaseNotesUrl);
    expect(result.updatePackageSize).toBe(42_000_000);
    expect(result.changelog).toBe(withOptionals.changelog);
  });

  it("rejects missing required fields", () => {
    const { latestVersion, ...missing } = validMetadata;
    expect(() => updateMetadataSchema.parse(missing)).toThrow();
  });

  it("rejects invalid checksum length", () => {
    const bad = { ...validMetadata, checksumSha256: "too-short" };
    expect(() => updateMetadataSchema.parse(bad)).toThrow();
  });

  it("rejects invalid download URL", () => {
    const bad = { ...validMetadata, downloadUrl: "not-a-url" };
    expect(() => updateMetadataSchema.parse(bad)).toThrow();
  });

  it("rejects non-positive package size", () => {
    const bad = { ...validMetadata, updatePackageSize: 0 };
    expect(() => updateMetadataSchema.parse(bad)).toThrow();
  });

  it("rejects invalid release date format", () => {
    const bad = { ...validMetadata, releaseDate: "yesterday" };
    expect(() => updateMetadataSchema.parse(bad)).toThrow();
  });

  it("infers the correct type", () => {
    const result = updateMetadataSchema.parse(validMetadata);
    const _typeCheck: import("./update").UpdateMetadata = result;
    expect(_typeCheck).toBeDefined();
  });
});

describe("updateRecordSchema", () => {
  const validRecord = {
    id: 1,
    version: "1.2.3",
    appliedAt: "2026-07-05T12:00:00Z",
    success: true,
    errorMessage: null,
  };

  it("accepts a successful update record", () => {
    const result = updateRecordSchema.parse(validRecord);
    expect(result.version).toBe("1.2.3");
    expect(result.success).toBe(true);
    expect(result.errorMessage).toBeNull();
  });

  it("accepts a failed update record with error message", () => {
    const failed = { ...validRecord, success: false, errorMessage: "Network timeout" };
    const result = updateRecordSchema.parse(failed);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("Network timeout");
  });

  it("rejects missing id", () => {
    const { id, ...missing } = validRecord;
    expect(() => updateRecordSchema.parse(missing)).toThrow();
  });

  it("rejects non-positive id", () => {
    expect(() => updateRecordSchema.parse({ ...validRecord, id: 0 })).toThrow();
  });
});

describe("recordUpdateInputSchema", () => {
  it("accepts valid input with only required fields", () => {
    const result = recordUpdateInputSchema.parse({ version: "1.2.3", success: true });
    expect(result.version).toBe("1.2.3");
  });

  it("accepts input with optional errorMessage", () => {
    const result = recordUpdateInputSchema.parse({
      version: "1.2.3",
      success: false,
      errorMessage: "Checksum mismatch",
    });
    expect(result.errorMessage).toBe("Checksum mismatch");
  });

  it("rejects empty version", () => {
    expect(() => recordUpdateInputSchema.parse({ version: "", success: true })).toThrow();
  });
});

describe("updateHistoryListSchema", () => {
  it("accepts empty history", () => {
    const result = updateHistoryListSchema.parse({ items: [], latest: null });
    expect(result.items).toHaveLength(0);
    expect(result.latest).toBeNull();
  });

  it("accepts history with records", () => {
    const payload = {
      items: [
        { id: 2, version: "1.2.0", appliedAt: "2026-07-04T12:00:00Z", success: true, errorMessage: null },
        { id: 1, version: "1.1.0", appliedAt: "2026-07-03T12:00:00Z", success: true, errorMessage: null },
      ],
      latest: { id: 2, version: "1.2.0", appliedAt: "2026-07-04T12:00:00Z", success: true, errorMessage: null },
    };
    const result = updateHistoryListSchema.parse(payload);
    expect(result.items).toHaveLength(2);
    expect(result.latest!.version).toBe("1.2.0");
  });
});
