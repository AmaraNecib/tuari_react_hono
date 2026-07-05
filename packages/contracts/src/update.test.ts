import { describe, expect, it } from "vitest";
import { updateMetadataSchema } from "./update";

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
