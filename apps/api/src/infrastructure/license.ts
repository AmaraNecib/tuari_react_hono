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

// Mirrors the desktop shell's TUARI_LICENSE_STATUS mapping
// (apps/desktop/src-tauri/src/license.rs): Valid|Warning -> active,
// ExpiredGrace -> grace, Locked|Expired -> expired, NotYetActive -> inactive,
// Tampered -> suspicious, Grace -> trial, Invalid -> unknown.
//
// This tuple is the ONE definition of the known set: the env reader validates
// against it and the refusal helpers switch on it, so an unrecognised value can
// never slip through as "usable".
export const LICENSE_STATUSES = [
  "active",
  "trial",
  "grace",
  "expired",
  "inactive",
  "suspicious",
  "unknown",
] as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export type LicenseInfo = {
  edition: Edition;
  features: LicensedFeature[];
  maxUsers: number;
  customer: { name: string; email: string } | null;
  expiresAt: string | null;
  status: LicenseStatus;
}

// ─── Env-var reader ────────────────────────────────────────────

/**
 * Validate a raw `TUARI_LICENSE_STATUS` value against the known set.
 *
 * A missing or blank status FAILS CLOSED as `unknown`. The desktop shell only
 * sets the license env block when `LicenseManager::initialize` succeeds
 * (apps/desktop/src-tauri/src/lib.rs); when initialization fails — a tampered
 * clock or an invalid `license.lic` — it still launches the sidecar with the
 * status absent. Treating that as a writable `trial` would leave the API fully
 * writable, which is exactly the state the license check exists to prevent.
 *
 * Any unrecognised value is likewise a typo or status drift and becomes
 * `unknown`.
 */
function parseLicenseStatus(raw: string | undefined): LicenseStatus {
  if (raw === undefined || raw.trim() === "") {
    return "unknown";
  }

  return (LICENSE_STATUSES as readonly string[]).includes(raw)
    ? (raw as LicenseStatus)
    : "unknown";
}

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
      ? (() => {
          try {
            return JSON.parse(process.env.TUARI_LICENSE_CUSTOMER);
          } catch {
            return null;
          }
        })()
      : null,
    expiresAt: process.env.TUARI_LICENSE_EXPIRES_AT || null,
    status: parseLicenseStatus(process.env.TUARI_LICENSE_STATUS),
  };
}

// ─── Status → refusal message ──────────────────────────────────

/**
 * Customer-facing refusal message for a license status that cannot perform
 * AUDITED MUTATIONS, or `null` when writes are allowed.
 *
 * `active` and the post-install `trial` are writable. `grace` (the post-expiry
 * window) is deliberately READ-ONLY: audited mutations are refused until the
 * license is renewed. Every other status — and every unrecognised value, via
 * the `default` — is refused as unusable.
 */
export function mutationLicenseRefusalMessage(status: LicenseStatus): string | null {
  switch (status) {
    case "active":
    case "trial":
      return null;
    case "grace":
      return "انتهت صلاحية الترخيص. مساحة العمل للقراءة فقط حتى تجديد الترخيص.";
    case "expired":
      return "انتهت صلاحية الترخيص. يرجى تجديد الترخيص للمتابعة.";
    case "inactive":
      return "الترخيص غير مُفعّل بعد. يرجى تفعيل الترخيص من صفحة الترخيص.";
    case "suspicious":
      return "تم اكتشاف تغيير في ساعة النظام. صحّح التاريخ وأعد تشغيل التطبيق.";
    case "unknown":
      return "تعذّر التحقق من الترخيص. يرجى إعادة تفعيل الترخيص.";
    default:
      // Defensive only: an out-of-band value (cast/JSON) must fail closed, not
      // fall through to "allowed".
      return "تعذّر التحقق من الترخيص. يرجى إعادة تفعيل الترخيص.";
  }
}

/**
 * Refusal message for READ-side gates (edition/feature access), or `null` when
 * access is allowed. Same policy as {@link mutationLicenseRefusalMessage} except
 * the read-only `grace` window is allowed through.
 */
export function readLicenseRefusalMessage(status: LicenseStatus): string | null {
  return status === "grace" ? null : mutationLicenseRefusalMessage(status);
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
