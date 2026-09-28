/**
 * Backup status schemas (#430).
 *
 * The API owns the database connection, so the daily local backup runs there
 * (a consistent `VACUUM INTO` snapshot). This is the read surface the UI uses
 * to show the operator whether the last backup succeeded.
 */
import { z } from "zod";

import { timestampSchema } from "./core";

/** A failed backup attempt: when it ran and why it failed. */
export const backupFailureSchema = z.object({
  at: timestampSchema,
  reason: z.string().min(1),
});

/**
 * Current backup status.
 *
 * `lastSuccessAt` and `lastBackupPath` are seeded from the newest on-disk
 * backup, so they survive a restart. `lastFailure` describes the most recent
 * failed attempt in this process; it is cleared by a later success.
 */
export const backupStatusSchema = z.object({
  lastSuccessAt: timestampSchema.nullable(),
  lastBackupPath: z.string().min(1).nullable(),
  lastFailure: backupFailureSchema.nullable(),
});

export type BackupFailure = z.infer<typeof backupFailureSchema>;
export type BackupStatus = z.infer<typeof backupStatusSchema>;
