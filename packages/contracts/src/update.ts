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
  releaseDate: z.string().datetime({ offset: true }),
  downloadUrl: z.string().url(),
  checksumSha256: z.string().length(64),
  isCritical: z.boolean(),
  releaseNotesUrl: z.string().url().optional(),
  updatePackageSize: z.number().int().positive().optional(),
  changelog: z.string().optional(),
});

export type UpdateMetadata = z.infer<typeof updateMetadataSchema>;
