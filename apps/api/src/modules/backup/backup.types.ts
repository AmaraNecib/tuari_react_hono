import type { BackupFailure, BackupRetention, BackupStatus } from "@tuari/contracts";

import type { BackupRetentionPolicy } from "./backup.policy";

/**
 * Result of one successful snapshot.
 *
 * `schemaVersion` is the live database's `PRAGMA user_version` (0 when unset)
 * and `encrypted` records whether a SQLCipher key was applied. Both are stored
 * in the snapshot marker so a later listing can tell a Tuari snapshot from an
 * unrelated folder that merely happens to sit in the backups root.
 */
export type BackupSnapshotResult = {
  schemaVersion: number;
  encrypted: boolean;
};

/**
 * Take a consistent snapshot of the live database into `outputPath`.
 *
 * The default implementation (`backup.snapshot.ts`) runs `VACUUM INTO` on a
 * dedicated connection inside a worker thread. The narrow port keeps the
 * service testable without a real database: a test injects a function that
 * resolves or rejects, and the copy itself is exercised separately.
 */
export type BackupSnapshotter = (
  outputPath: string,
) => Promise<BackupSnapshotResult>;

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
  /**
   * Point subsequent runs and the status at a new root (#436). Re-seeds the
   * status from that root so the screen never describes the old folder. The
   * caller validates/persists the path first.
   */
  setBackupsRoot: (path: string) => void;
};

export type BackupServiceDeps = {
  /** Snapshot writer; production passes the worker-backed implementation. */
  snapshot: BackupSnapshotter;
  /** Root that holds the dated backup folders. */
  backupsRootPath: string;
  /** Retention policy; defaults to `BACKUP_RETENTION`. */
  policy?: BackupRetentionPolicy;
  /** Injected clock so "due" is testable without waiting a day. */
  now?: () => Date;
  logger?: BackupLogger;
};

export type { BackupFailure, BackupRetention, BackupStatus };
