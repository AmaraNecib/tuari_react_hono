/**
 * License types and schemas for Tuari licensing.
 *
 * Matches the Rust LicensePayload struct field-by-field per the
 * Licensing Architecture (Section 2.2).
 */
import { z } from "zod";

// ─── Enum schemas ───────────────────────────────────────────────

/** Unique license identifier: LCE-YYYYMMDD-RANDOM6 */
export const licenseIdSchema = z.string().regex(
  /^LCE-\d{8}-[A-Z0-9]{6}$/,
  "License ID must match format LCE-YYYYMMDD-XXXXXX",
);

/** Product edition. */
export const editionSchema = z.enum(["standard", "professional", "enterprise"]);

/** License type. Perpetual licenses have no validUntil. */
export const licenseTypeSchema = z.enum([
  "perpetual",
  "subscription",
  "trial",
  "grace",
]);

/** Feature flags that can be enabled per license. */
export const licensedFeatureSchema = z.enum([
  "lan_server",
  "multi_user",
  "encrypted_db",
  "advanced_reports",
  "multi_site_sync",
  "audit_export",
  "external_api",
  "priority_support",
]);

/** Array of feature flags. Optional, defaults to empty. */
export const licenseFeaturesSchema = z.array(licensedFeatureSchema);

// ─── Object schemas ─────────────────────────────────────────────

/** Extensible metadata attached to a license. */
export const licenseMetadataSchema = z
  .object({
    version: z.string().optional(),
    buildNumber: z.number().int().optional(),
  })
  .passthrough();

/** Full license payload (Section 2.2 of Licensing Architecture). */
export const licensePayloadSchema = z
  .object({
    licenseId: licenseIdSchema,
    issuedAt: z.string().datetime({ offset: true }),
    issuedTo: z.string().min(1),
    email: z.string().email(),
    edition: editionSchema,
    features: licenseFeaturesSchema.default([]),
    maxUsers: z.number().int().min(0),
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }).optional(),
    licenseType: licenseTypeSchema,
    metadata: licenseMetadataSchema.default({}),
  })
  .refine(
    (data) => {
      if (data.validUntil && data.validFrom > data.validUntil) {
        return false;
      }
      return true;
    },
    { message: "validFrom must be before or equal to validUntil" },
  );

// ─── Exported types ─────────────────────────────────────────────

export type LicenseId = z.infer<typeof licenseIdSchema>;
export type Edition = z.infer<typeof editionSchema>;
export type LicenseType = z.infer<typeof licenseTypeSchema>;
export type LicensedFeature = z.infer<typeof licensedFeatureSchema>;
export type LicensePayload = z.infer<typeof licensePayloadSchema>;
