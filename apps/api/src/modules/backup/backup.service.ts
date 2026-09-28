/**
 * Daily local backup service (#430).
 *
 * Runs at startup: when the newest backup is older than yesterday, it writes a
 * dated folder holding a full, consistent copy of the database, then prunes the
 * folder set according to `BACKUP_RETENTION`.
 *
 * The copy goes through `VACUUM INTO` because a plain file copy while WAL is
 * active can produce a corrupt backup, which is worse than none. `VACUUM INTO`
 * is a single statement, is consistent while other writers are active, and
 * works the same under SQLCipher (the output is encrypted with the same key).
 *
 * Attachments are NOT backed up in this version (deliberate MVP cut; see
 * docs/backups.md). A restored database may therefore reference attachment
 * files that are gone.
 *
 * Failure is non-fatal: `runDueBackup` never throws, the app stays usable, and
 * the reason is recorded on the status the UI reads. Every previous backup is
 * left intact — work goes to a `.staging-*` folder that is renamed into place
 * only when complete.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

import { escapeSqliteString } from "../../infrastructure/database/factory";
import {
  BACKUP_DIRECTORY_NAME_PATTERN,
  BACKUP_RETENTION,
  BACKUP_STAGING_PREFIX,
  formatBackupDate,
  isBackupDue,
  previousDay,
  selectBackupsToPrune,
  type BackupRetentionPolicy,
} from "./backup.policy";
import type {
  BackupFailure,
  BackupLogger,
  BackupRunResult,
  BackupService,
  BackupServiceDeps,
} from "./backup.types";

/** Name of the database file inside a backup folder. */
export const BACKUP_DB_FILE_NAME = "tuari.sqlite";

const isBackupDirectory = (name: string): boolean =>
  BACKUP_DIRECTORY_NAME_PATTERN.test(name);

/**
 * True only for an existing directory. A missing path or a file at the backups
 * root returns false instead of throwing, so a misconfigured root can never
 * block startup; the run itself reports it non-fatally.
 */
const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Existing dated backup folders, ascending (oldest first). */
export const listBackupDates = (backupsRootPath: string): string[] => {
  if (!isDirectory(backupsRootPath)) return [];

  return readdirSync(backupsRootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isBackupDirectory(entry.name))
    .map((entry) => entry.name)
    .sort();
};

/** Remove `.staging-*` folders a crashed previous run left behind. */
const removeStaleStagingEntries = (backupsRootPath: string): void => {
  if (!isDirectory(backupsRootPath)) return;

  for (const entry of readdirSync(backupsRootPath)) {
    if (entry.startsWith(BACKUP_STAGING_PREFIX)) {
      rmSync(join(backupsRootPath, entry), { recursive: true, force: true });
    }
  }
};

/**
 * Delete the folders the policy rejects, oldest-first.
 *
 * A dated folder is a full copy, so removing it can never orphan a file a
 * surviving snapshot needs.
 */
export const pruneBackups = (
  backupsRootPath: string,
  dates: readonly string[],
  policy: BackupRetentionPolicy,
  logger: BackupLogger,
): string[] => {
  const toPrune = selectBackupsToPrune(dates, policy);
  if (toPrune.length === 0) return [];

  const pruned: string[] = [];
  for (const date of toPrune) {
    const directory = join(backupsRootPath, date);
    try {
      rmSync(directory, { recursive: true, force: true });
      pruned.push(date);
    } catch (error) {
      /* v8 ignore start -- platform-dependent: a locked directory (Windows sharing violation) is kept, not deleted */
      logger.error(`[backup] could not prune ${directory}; keeping it`, error);
      /* v8 ignore stop */
    }
  }
  return pruned;
};

/**
 * Seed the status from the newest on-disk backup so `backupStatus` is useful
 * after a restart on a day when no run is due (`lastSuccessAt` = folder mtime,
 * the closest truthful timestamp without a manifest file).
 */
const seedStatusFromDisk = (
  backupsRootPath: string,
): { lastBackupPath: string | null; lastSuccessAt: string | null } => {
  const dates = listBackupDates(backupsRootPath);
  if (dates.length === 0) {
    return { lastBackupPath: null, lastSuccessAt: null };
  }

  const newest = join(backupsRootPath, dates[dates.length - 1]!);
  return {
    lastBackupPath: newest,
    lastSuccessAt: statSync(newest).mtime.toISOString(),
  };
};

export const createBackupService = (
  deps: BackupServiceDeps,
): BackupService => {
  const now = deps.now ?? (() => new Date());
  const policy = deps.policy ?? BACKUP_RETENTION;
  const logger: BackupLogger = deps.logger ?? {
    info: (message) => console.log(message),
    error: (message, cause) => console.error(message, cause),
  };

  const seeded = seedStatusFromDisk(deps.backupsRootPath);
  let lastBackupPath = seeded.lastBackupPath;
  let lastSuccessAt = seeded.lastSuccessAt;
  let lastFailure: BackupFailure | null = null;

  const runDueBackup = async (): Promise<BackupRunResult> => {
    const runAt = now();
    removeStaleStagingEntries(deps.backupsRootPath);

    const existingDates = listBackupDates(deps.backupsRootPath);
    const newest =
      existingDates.length > 0 ? existingDates[existingDates.length - 1]! : null;
    if (!isBackupDue(newest, runAt)) return { status: "not-due" };

    const date = formatBackupDate(previousDay(runAt));
    const targetDirectory = join(deps.backupsRootPath, date);

    let stagingDirectory: string | null = null;
    try {
      mkdirSync(deps.backupsRootPath, { recursive: true });
      stagingDirectory = mkdtempSync(
        join(deps.backupsRootPath, BACKUP_STAGING_PREFIX),
      );

      deps.db.exec(
        `VACUUM INTO '${escapeSqliteString(join(stagingDirectory, BACKUP_DB_FILE_NAME))}'`,
      );

      renameSync(stagingDirectory, targetDirectory);
      stagingDirectory = null;

      lastBackupPath = targetDirectory;
      lastSuccessAt = runAt.toISOString();
      lastFailure = null;
      logger.info(`[backup] created ${targetDirectory} for ${date}`);

      pruneBackups(
        deps.backupsRootPath,
        [...existingDates, date],
        policy,
        logger,
      );
      return { status: "created", date, path: targetDirectory };
    } catch (error) {
      if (stagingDirectory !== null) {
        rmSync(stagingDirectory, { recursive: true, force: true });
      }
      const reason = error instanceof Error ? error.message : String(error);
      lastFailure = { at: runAt.toISOString(), reason };
      logger.error(`[backup] failed for ${date}: ${reason}`, error);
      return { status: "failed", date, reason };
    }
  };

  return {
    runDueBackup,
    getStatus: () => ({ lastBackupPath, lastSuccessAt, lastFailure }),
  };
};
