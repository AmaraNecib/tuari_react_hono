/**
 * Update metadata schemas for Tuari update checking.
 *
 * Business Authority responsibility (M4.1):
 * Return latest version info when the user checks for updates.
 */
import { z } from "zod";

/** Latest available update metadata returned by GET /api/updates/latest. */
export const updateMetadataSchema = z.object({
  latestVersion: z.string().min(1),
  minSupportedVersion: z.string().min(1),
  releaseDate: z.iso.datetime({ offset: true }),
  downloadUrl: z.string().url(),
  checksumSha256: z.string().length(64),
  isCritical: z.boolean(),
  releaseNotesUrl: z.string().url().optional(),
  updatePackageSize: z.number().int().positive().optional(),
  changelog: z.string().optional(),
});

export type UpdateMetadata = z.infer<typeof updateMetadataSchema>;

// ─── M4.3 — Update history ───────────────────────────────────────

/** A single applied-update record from the update_history table. */
export const updateRecordSchema = z.object({
  id: z.number().int().positive(),
  version: z.string().min(1),
  appliedAt: z.iso.datetime({ offset: true }),
  success: z.boolean(),
  errorMessage: z.string().nullable(),
});

/** Input for recording a new update attempt. */
export const recordUpdateInputSchema = z.object({
  version: z.string().min(1),
  success: z.boolean(),
  errorMessage: z.string().nullable().optional(),
});

/** Result of a record-update operation. */
export const recordUpdateResultSchema = z.object({
  record: updateRecordSchema,
});

/** Response shape for listing update history. */
export const updateHistoryListSchema = z.object({
  items: z.array(updateRecordSchema),
  latest: updateRecordSchema.nullable(),
});

export type UpdateRecord = z.infer<typeof updateRecordSchema>;
export type RecordUpdateInput = z.infer<typeof recordUpdateInputSchema>;
export type RecordUpdateResult = z.infer<typeof recordUpdateResultSchema>;
export type UpdateHistoryList = z.infer<typeof updateHistoryListSchema>;
