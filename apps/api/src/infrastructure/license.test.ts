import { afterEach, describe, expect, it } from "vitest";
import {
  editionToMinEdition,
  getLicenseInfo,
  meetsMinEdition,
  mutationLicenseRefusalMessage,
  readLicenseRefusalMessage,
} from "./license";

describe("getLicenseInfo", () => {
  afterEach(() => {
    // Clean all TUARI_LICENSE_* env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("TUARI_LICENSE_")) {
        delete process.env[key];
      }
    }
  });

  it("defaults the non-status fields and fails closed on a missing status", () => {
    delete process.env.TUARI_LICENSE_STATUS;
    const info = getLicenseInfo();
    expect(info.edition).toBe("standard");
    expect(info.features).toEqual([]);
    expect(info.maxUsers).toBe(0);
    expect(info.customer).toBeNull();
    expect(info.expiresAt).toBeNull();
    expect(info.status).toBe("unknown");
  });

  it("reads edition from TUARI_LICENSE_EDITION", () => {
    process.env.TUARI_LICENSE_EDITION = "professional";
    const info = getLicenseInfo();
    expect(info.edition).toBe("professional");
  });

  it("reads features from TUARI_LICENSE_FEATURES and splits by comma", () => {
    process.env.TUARI_LICENSE_FEATURES = "lan_server,multi_user,advanced_reports";
    const info = getLicenseInfo();
    expect(info.features).toEqual(["lan_server", "multi_user", "advanced_reports"]);
  });

  it("returns empty features array when TUARI_LICENSE_FEATURES is empty", () => {
    process.env.TUARI_LICENSE_FEATURES = "";
    const info = getLicenseInfo();
    expect(info.features).toEqual([]);
  });

  it("parses maxUsers from TUARI_LICENSE_MAX_USERS", () => {
    process.env.TUARI_LICENSE_MAX_USERS = "10";
    const info = getLicenseInfo();
    expect(info.maxUsers).toBe(10);
  });

  it("defaults maxUsers to 0 (unlimited) when env var is missing", () => {
    const info = getLicenseInfo();
    expect(info.maxUsers).toBe(0);
  });

  it("handles NaN maxUsers gracefully", () => {
    process.env.TUARI_LICENSE_MAX_USERS = "not-a-number";
    const info = getLicenseInfo();
    expect(info.maxUsers).toBeNaN();
  });

  it("reads customer JSON from TUARI_LICENSE_CUSTOMER", () => {
    const customer = { name: "Acme SARL", email: "contact@acme.dz" };
    process.env.TUARI_LICENSE_CUSTOMER = JSON.stringify(customer);
    const info = getLicenseInfo();
    expect(info.customer).toEqual(customer);
  });

  it("returns null customer when TUARI_LICENSE_CUSTOMER contains malformed JSON", () => {
    process.env.TUARI_LICENSE_CUSTOMER = "not-valid-json{{";
    const info = getLicenseInfo();
    expect(info.customer).toBeNull();
  });

  it("returns null customer when TUARI_LICENSE_CUSTOMER is not set", () => {
    const info = getLicenseInfo();
    expect(info.customer).toBeNull();
  });

  it("reads expiresAt from TUARI_LICENSE_EXPIRES_AT", () => {
    process.env.TUARI_LICENSE_EXPIRES_AT = "2027-07-01T00:00:00Z";
    const info = getLicenseInfo();
    expect(info.expiresAt).toBe("2027-07-01T00:00:00Z");
  });

  it("returns null expiresAt when env var is empty string", () => {
    process.env.TUARI_LICENSE_EXPIRES_AT = "";
    const info = getLicenseInfo();
    expect(info.expiresAt).toBeNull();
  });

  it("reads status from TUARI_LICENSE_STATUS", () => {
    process.env.TUARI_LICENSE_STATUS = "active";
    const info = getLicenseInfo();
    expect(info.status).toBe("active");
  });

  it("fails closed to unknown when TUARI_LICENSE_STATUS is not set", () => {
    delete process.env.TUARI_LICENSE_STATUS;
    expect(getLicenseInfo().status).toBe("unknown");
  });

  it("fails closed to unknown when TUARI_LICENSE_STATUS is an unrecognised value", () => {
    process.env.TUARI_LICENSE_STATUS = "actve";
    expect(getLicenseInfo().status).toBe("unknown");
  });

  it("fails closed to unknown when TUARI_LICENSE_STATUS is blank", () => {
    process.env.TUARI_LICENSE_STATUS = "   ";
    expect(getLicenseInfo().status).toBe("unknown");
  });

  it("reads enterprise edition with all features", () => {
    process.env.TUARI_LICENSE_EDITION = "enterprise";
    process.env.TUARI_LICENSE_FEATURES =
      "lan_server,multi_user,encrypted_db,advanced_reports,multi_site_sync,audit_export,external_api,priority_support";
    process.env.TUARI_LICENSE_MAX_USERS = "0";
    process.env.TUARI_LICENSE_STATUS = "active";
    const info = getLicenseInfo();
    expect(info.edition).toBe("enterprise");
    expect(info.features).toContain("encrypted_db");
    expect(info.features).toContain("multi_site_sync");
    expect(info.maxUsers).toBe(0);
    expect(info.status).toBe("active");
  });
});

describe("meetsMinEdition", () => {
  it("returns true when current edition equals required edition", () => {
    expect(meetsMinEdition("standard", "standard")).toBe(true);
    expect(meetsMinEdition("professional", "professional")).toBe(true);
    expect(meetsMinEdition("enterprise", "enterprise")).toBe(true);
  });

  it("returns true when current edition is higher than required", () => {
    expect(meetsMinEdition("professional", "standard")).toBe(true);
    expect(meetsMinEdition("enterprise", "standard")).toBe(true);
    expect(meetsMinEdition("enterprise", "professional")).toBe(true);
  });

  it("returns false when current edition is lower than required", () => {
    expect(meetsMinEdition("standard", "professional")).toBe(false);
    expect(meetsMinEdition("standard", "enterprise")).toBe(false);
    expect(meetsMinEdition("professional", "enterprise")).toBe(false);
  });
});

describe("editionToMinEdition", () => {
  it("returns professional for professional-tier features", () => {
    expect(editionToMinEdition("lan_server")).toBe("professional");
    expect(editionToMinEdition("multi_user")).toBe("professional");
    expect(editionToMinEdition("advanced_reports")).toBe("professional");
    expect(editionToMinEdition("external_api")).toBe("professional");
  });

  it("returns enterprise for enterprise-tier features", () => {
    expect(editionToMinEdition("encrypted_db")).toBe("enterprise");
    expect(editionToMinEdition("multi_site_sync")).toBe("enterprise");
    expect(editionToMinEdition("audit_export")).toBe("enterprise");
    expect(editionToMinEdition("priority_support")).toBe("enterprise");
  });
});

describe("mutationLicenseRefusalMessage", () => {
  it("allows writes for active and the post-install trial", () => {
    expect(mutationLicenseRefusalMessage("active")).toBeNull();
    expect(mutationLicenseRefusalMessage("trial")).toBeNull();
  });

  it("refuses the post-expiry grace window as read-only", () => {
    expect(mutationLicenseRefusalMessage("grace")).toContain("للقراءة فقط");
  });

  it("refuses every unusable status with a message", () => {
    for (const status of ["expired", "inactive", "suspicious", "unknown"] as const) {
      expect(mutationLicenseRefusalMessage(status)).toEqual(expect.any(String));
    }
  });
});

describe("readLicenseRefusalMessage", () => {
  it("allows reads during active, trial and the read-only grace window", () => {
    expect(readLicenseRefusalMessage("active")).toBeNull();
    expect(readLicenseRefusalMessage("trial")).toBeNull();
    expect(readLicenseRefusalMessage("grace")).toBeNull();
  });

  it("refuses reads for every unusable status", () => {
    for (const status of ["expired", "inactive", "suspicious", "unknown"] as const) {
      expect(readLicenseRefusalMessage(status)).toEqual(expect.any(String));
    }
  });
});
