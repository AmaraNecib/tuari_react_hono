/**
 * Backup status schemas (#430, extended #439).
 *
 * The API owns the database connection, so the daily local backup runs there
 * (a consistent `VACUUM INTO` snapshot). This is the read surface the UI uses
 * to show the operator whether the last backup succeeded — and where it lives.
 */
import { z } from "zod";

import { timestampSchema } from "./core";

/** A failed backup attempt: when it ran and why it failed. */
export const backupFailureSchema = z.object({
  at: timestampSchema,
  reason: z.string().min(1),
});

/**
 * Retention policy surfaced with the status so the screen can state it without
 * duplicating the numbers. Mirrors `BACKUP_RETENTION` on the API side.
 */
export const backupRetentionSchema = z.object({
  daily: z.number().int().positive(),
  weekly: z.number().int().positive(),
  monthly: z.number().int().positive(),
});

/**
 * Current backup status.
 *
 * `lastSuccessAt` and `lastBackupPath` are seeded from the newest on-disk
 * backup, so they survive a restart. `lastFailure` describes the most recent
 * failed attempt in this process; it is cleared by a later success.
 *
 * `backupsRootPath` is the configured root (always present, even on first
 * run) so the operator can find the folder to restore from. `retention` is the
 * active policy.
 */
export const backupStatusSchema = z.object({
  lastSuccessAt: timestampSchema.nullable(),
  lastBackupPath: z.string().min(1).nullable(),
  lastFailure: backupFailureSchema.nullable(),
  backupsRootPath: z.string().min(1),
  retention: backupRetentionSchema,
});

/** Input for choosing the folder the daily snapshots are written to (#436). */
export const setBackupsRootInputSchema = z.object({
  path: z.string().min(1),
});

/**
 * Result of saving the backup folder.
 *
 * `success: true` carries the normalized path and whether it was written to
 * the user-editable config file (`persisted: false` means the choice applies
 * to this session only because no config file is configured). `success: false`
 * carries a message that names the problem (empty path, a file at the path,
 * permission denied, or a persistence failure).
 */
export const setBackupsRootResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    path: z.string().min(1),
    persisted: z.boolean(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string().min(1),
  }),
]);

export type BackupFailure = z.infer<typeof backupFailureSchema>;
export type BackupRetention = z.infer<typeof backupRetentionSchema>;
export type BackupStatus = z.infer<typeof backupStatusSchema>;
export type SetBackupsRootInput = z.infer<typeof setBackupsRootInputSchema>;
export type SetBackupsRootResult = z.infer<typeof setBackupsRootResultSchema>;
