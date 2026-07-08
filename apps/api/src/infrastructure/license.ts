/**
 * License info reader and feature-gating helpers.
 *
 * Reads license state from the **structured environment variables** that the
 * Rust shell sets (Section 5.3 / 15.5 of the Licensing Architecture).
 *
 * NEVER reads the raw `license.lic` file — that is the Rust layer's
 * responsibility.  The sidecar only sees the parsed, validated subset that
 * Rust explicitly chooses to share.
 */
import type { Edition, LicensedFeature } from "@tuari/contracts";

// ─── Public types ──────────────────────────────────────────────

export interface LicenseInfo {
  edition: Edition;
  features: LicensedFeature[];
  maxUsers: number;
  customer: { name: string; email: string } | null;
  expiresAt: string | null;
  status: "active" | "trial" | "expired" | "grace";
}

// ─── Env-var reader ────────────────────────────────────────────

/**
 * Read the current license info from the environment.
 *
 * Every call re-reads process.env so the result always reflects the
 * *current* state (useful in tests and in scenarios where env vars are
 * updated between requests, though in production they are set once at
 * process start).
 */
export function getLicenseInfo(): LicenseInfo {
  return {
    edition: (process.env.TUARI_LICENSE_EDITION ?? "standard") as Edition,
    features: (process.env.TUARI_LICENSE_FEATURES ?? "")
      .split(",")
      .filter(Boolean) as LicensedFeature[],
    maxUsers: parseInt(process.env.TUARI_LICENSE_MAX_USERS ?? "1", 10),
    customer: process.env.TUARI_LICENSE_CUSTOMER
      ? JSON.parse(process.env.TUARI_LICENSE_CUSTOMER)
      : null,
    expiresAt: process.env.TUARI_LICENSE_EXPIRES_AT || null,
    status: (process.env.TUARI_LICENSE_STATUS ?? "trial") as LicenseInfo["status"],
  };
}

// ─── Edition comparison ────────────────────────────────────────

const editionOrder: Record<Edition, number> = {
  standard: 0,
  professional: 1,
  enterprise: 2,
};

/**
 * Returns `true` when `current` is at least `min` in the edition hierarchy.
 */
export function meetsMinEdition(current: Edition, min: Edition): boolean {
  const currentRank = editionOrder[current];
  const minRank = editionOrder[min];
  if (currentRank === undefined || minRank === undefined) {
    return false;
  }
  return currentRank >= minRank;
}

// ─── Feature → minimum edition map ─────────────────────────────

/**
 * Returns the minimum edition that unlocks the given feature.
 *
 * Matches the Edition → Feature Matrix in Section 4.2 of the
 * Licensing Architecture.
 */
export function editionToMinEdition(feature: LicensedFeature): Edition {
  const featureMinEdition: Record<LicensedFeature, Edition> = {
    lan_server: "professional",
    multi_user: "professional",
    advanced_reports: "professional",
    external_api: "professional",
    encrypted_db: "enterprise",
    multi_site_sync: "enterprise",
    audit_export: "enterprise",
    priority_support: "enterprise",
  };
  return featureMinEdition[feature] ?? "enterprise";
}
