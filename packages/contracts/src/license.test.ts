import { describe, expect, it } from "vitest";
import {
  licenseIdSchema,
  editionSchema,
  licenseTypeSchema,
  licensedFeatureSchema,
  licensePayloadSchema,
} from "./index";

const validPayload = {
  licenseId: "LCE-20260701-ABC123",
  issuedAt: "2026-06-30T00:00:00Z",
  issuedTo: "Acme Construction SARL",
  email: "contact@acme.dz",
  edition: "professional",
  features: ["multi_user", "lan_server", "encrypted_db", "advanced_reports"],
  maxUsers: 10,
  validFrom: "2026-07-01T00:00:00Z",
  validUntil: "2027-07-01T00:00:00Z",
  licenseType: "perpetual",
  metadata: {
    version: "1.0",
    buildNumber: 42,
  },
};

describe("licenseIdSchema", () => {
  it("accepts valid license ID format", () => {
    expect(licenseIdSchema.parse("LCE-20260701-ABC123")).toBe("LCE-20260701-ABC123");
  });

  it("accepts license ID with numbers in random part", () => {
    expect(licenseIdSchema.parse("LCE-20260701-123ABC")).toBe("LCE-20260701-123ABC");
  });

  it("rejects missing LCE prefix", () => {
    expect(() => licenseIdSchema.parse("INVALID-20260701-ABC123")).toThrow();
  });

  it("rejects bad date part", () => {
    expect(() => licenseIdSchema.parse("LCE-2026-ABC123")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => licenseIdSchema.parse("")).toThrow();
  });
});

describe("editionSchema", () => {
  it("accepts standard", () => {
    expect(editionSchema.parse("standard")).toBe("standard");
  });

  it("accepts professional", () => {
    expect(editionSchema.parse("professional")).toBe("professional");
  });

  it("accepts enterprise", () => {
    expect(editionSchema.parse("enterprise")).toBe("enterprise");
  });

  it("rejects invalid edition", () => {
    expect(() => editionSchema.parse("premium")).toThrow();
  });
});

describe("licenseTypeSchema", () => {
  it("accepts perpetual", () => {
    expect(licenseTypeSchema.parse("perpetual")).toBe("perpetual");
  });

  it("accepts subscription", () => {
    expect(licenseTypeSchema.parse("subscription")).toBe("subscription");
  });

  it("accepts trial", () => {
    expect(licenseTypeSchema.parse("trial")).toBe("trial");
  });

  it("accepts grace", () => {
    expect(licenseTypeSchema.parse("grace")).toBe("grace");
  });

  it("rejects invalid license type", () => {
    expect(() => licenseTypeSchema.parse("invalid")).toThrow();
  });
});

describe("licensedFeatureSchema", () => {
  const features = [
    "lan_server",
    "multi_user",
    "encrypted_db",
    "advanced_reports",
    "multi_site_sync",
    "audit_export",
    "external_api",
    "priority_support",
  ];

  features.forEach((feature) => {
    it(`accepts ${feature}`, () => {
      expect(licensedFeatureSchema.parse(feature)).toBe(feature);
    });
  });

  it("rejects unknown feature", () => {
    expect(() => licensedFeatureSchema.parse("unknown_feature")).toThrow();
  });
});

describe("licensePayloadSchema", () => {
  it("accepts a complete valid payload", () => {
    const result = licensePayloadSchema.parse(validPayload);
    expect(result.licenseId).toBe("LCE-20260701-ABC123");
    expect(result.edition).toBe("professional");
    expect(result.maxUsers).toBe(10);
    expect(result.features).toHaveLength(4);
  });

  it("defaults features to empty array when omitted", () => {
    const { features, ...payload } = validPayload;
    const result = licensePayloadSchema.parse(payload);
    expect(result.features).toEqual([]);
  });

  it("defaults metadata to empty object when omitted", () => {
    const { metadata, ...payload } = validPayload;
    const result = licensePayloadSchema.parse(payload);
    expect(result.metadata).toEqual({});
  });

  it("accepts perpetual license without validUntil", () => {
    const { validUntil, ...payload } = validPayload;
    const result = licensePayloadSchema.parse(payload);
    expect(result.licenseType).toBe("perpetual");
    expect(result).not.toHaveProperty("validUntil");
  });

  it("rejects missing licenseId", () => {
    const { licenseId, ...payload } = validPayload;
    expect(() => licensePayloadSchema.parse(payload)).toThrow();
  });

  it("rejects missing issuedTo", () => {
    const { issuedTo, ...payload } = validPayload;
    expect(() => licensePayloadSchema.parse(payload)).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      licensePayloadSchema.parse({ ...validPayload, email: "not-an-email" }),
    ).toThrow();
  });

  it("rejects invalid edition", () => {
    expect(() =>
      licensePayloadSchema.parse({ ...validPayload, edition: "premium" }),
    ).toThrow();
  });

  it("rejects negative maxUsers", () => {
    expect(() =>
      licensePayloadSchema.parse({ ...validPayload, maxUsers: -1 }),
    ).toThrow();
  });

  it("rejects validFrom after validUntil", () => {
    expect(() =>
      licensePayloadSchema.parse({
        ...validPayload,
        validFrom: "2028-01-01T00:00:00Z",
        validUntil: "2027-01-01T00:00:00Z",
      }),
    ).toThrow();
  });

  it("accepts features as override array with built-in features", () => {
    const result = licensePayloadSchema.parse({
      ...validPayload,
      features: ["encrypted_db"],
    });
    expect(result.features).toEqual(["encrypted_db"]);
  });

  it("rejects unknown features in the array", () => {
    expect(() =>
      licensePayloadSchema.parse({
        ...validPayload,
        features: ["unknown_feature"],
      }),
    ).toThrow();
  });
});
