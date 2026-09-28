import type { BackupFailure, BackupStatus } from "@tuari/contracts";

import type { BackupRetentionPolicy } from "./backup.policy";

/**
 * Narrow database port the backup service needs: one `exec` for
 * `VACUUM INTO`. Keeping it this small means the failure path is testable by
 * injecting a throwing `exec`, with no real disk-full/permission dependency.
 */
export type BackupDatabase = {
  exec: (sql: string) => unknown;
};

/** Outcome of one `runDueBackup()` call. */
export type BackupRunResult =
  | { status: "not-due" }
  | { status: "created"; date: string; path: string }
  | { status: "failed"; date: string; reason: string };

/** Injectable logger; defaults to `console.log` / `console.error`. */
export type BackupLogger = {
  info: (message: string) => void;
  error: (message: string, cause?: unknown) => void;
};

export type BackupService = {
  /**
   * Take a backup when one is due, never throw. On failure the reason is
   * recorded on the status and returned; a partial staging dir is removed and
   * every previous backup is left intact.
   */
  runDueBackup: () => Promise<BackupRunResult>;
  /** Current status (seeded from disk at construction, updated by runs). */
  getStatus: () => BackupStatus;
};

export type BackupServiceDeps = {
  db: BackupDatabase;
  /** Root that holds the dated backup folders. */
  backupsRootPath: string;
  /** Retention policy; defaults to `BACKUP_RETENTION`. */
  policy?: BackupRetentionPolicy;
  /** Injected clock so "due" is testable without waiting a day. */
  now?: () => Date;
  logger?: BackupLogger;
};

export type { BackupFailure, BackupStatus };
