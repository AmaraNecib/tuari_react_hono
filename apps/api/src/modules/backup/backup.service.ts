/**
 * Daily local backup service (#430).
 *
 * Runs at startup: when the newest backup is older than yesterday, it writes a
 * dated folder holding a full, consistent copy of the database plus a
 * `snapshot.json` marker, then prunes the folder set according to
 * `BACKUP_RETENTION`.
 *
 * The copy goes through `VACUUM INTO` (see `backup.snapshot.ts`) because a
 * plain file copy while WAL is active can produce a corrupt backup, which is
 * worse than none. `VACUUM INTO` is a single statement, is consistent while
 * other writers are active, and works the same under SQLCipher (the output is
 * encrypted with the same key).
 *
 * Every snapshot folder carries a `snapshot.json` marker naming the app and the
 * snapshot format. The marker is what makes a folder OURS: listing, pruning and
 * deletion all require it, so a backups root pointed at a shared directory can
 * never have an unrelated same-named folder treated as a backup (or deleted).
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
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

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

/** Name of the marker that identifies a folder as a Tuari snapshot. */
export const BACKUP_MARKER_FILE_NAME = "snapshot.json";

const BACKUP_MARKER_APP = "tuari";
const BACKUP_MARKER_FORMAT = 1;

/** The 16-byte SQLite file magic every plaintext database starts with. */
const SQLITE_HEADER_MAGIC = Buffer.from("SQLite format 3\u0000", "latin1");

/**
 * Marker stored inside every snapshot folder. The app + format pair is what a
 * listing trusts; `schemaVersion`/`encrypted`/`takenAt` are informational (the
 * schema version is the live DB's `PRAGMA user_version`, 0 when unset).
 */
const snapshotMarkerSchema = z.object({
  app: z.literal(BACKUP_MARKER_APP),
  format: z.literal(BACKUP_MARKER_FORMAT),
  schemaVersion: z.number().int().nonnegative(),
  databaseFile: z.literal(BACKUP_DB_FILE_NAME),
  encrypted: z.boolean(),
  takenAt: z.string().min(1),
});

type SnapshotMarker = z.infer<typeof snapshotMarkerSchema>;

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

/** Parse a marker file's bytes; any malformed content means "not ours". */
export const parseSnapshotMarker = (raw: string): SnapshotMarker | null => {
  try {
    const parsed = snapshotMarkerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const readSnapshotMarker = (directory: string): SnapshotMarker | null => {
  try {
    return parseSnapshotMarker(
      readFileSync(join(directory, BACKUP_MARKER_FILE_NAME), "utf8"),
    );
  } catch {
    return null;
  }
};

const hasSnapshotDatabase = (directory: string): boolean => {
  try {
    return statSync(join(directory, BACKUP_DB_FILE_NAME)).size > 0;
  } catch {
    return false;
  }
};

/** Read the 16-byte file magic without loading the whole database. */
const hasSqliteHeader = (databasePath: string): boolean => {
  try {
    const fd = openSync(databasePath, "r");
    try {
      const header = Buffer.alloc(SQLITE_HEADER_MAGIC.length);
      const read = readSync(fd, header, 0, header.length, 0);
      return read === header.length && header.equals(SQLITE_HEADER_MAGIC);
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
};

/**
 * True only for a dated folder this feature created: it must carry a valid
 * marker AND a non-empty database file. A plaintext snapshot must also start
 * with the SQLite magic, so a marker next to a junk/truncated file is rejected
 * (a positive size alone does not make a usable database). An encrypted copy's
 * header is SQLCipher's, so there the marker is the validity signal — and the
 * worker ran `PRAGMA integrity_check` on the copy when it was written.
 */
export const isUsableSnapshot = (directory: string): boolean => {
  if (!hasSnapshotDatabase(directory)) return false;
  const marker = readSnapshotMarker(directory);
  if (marker === null) return false;
  if (!marker.encrypted && !hasSqliteHeader(join(directory, BACKUP_DB_FILE_NAME))) {
    return false;
  }
  return true;
};

/**
 * Existing complete dated backup folders, ascending (oldest first).
 *
 * `now` (when given) drops folders dated in the future: a snapshot written
 * under a clock that was set ahead must not count as the newest (it would
 * suppress every backup until its date arrived, and it would hold the newest
 * retention slot against the fresh copy).
 */
export const listBackupDates = (
  backupsRootPath: string,
  now?: Date,
): string[] => {
  if (!isDirectory(backupsRootPath)) return [];

  const ceiling = now === undefined ? null : formatBackupDate(now);
  return readdirSync(backupsRootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isBackupDirectory(entry.name))
    .map((entry) => entry.name)
    .filter((name) => ceiling === null || name <= ceiling)
    .filter((name) => isUsableSnapshot(join(backupsRootPath, name)))
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

export type BackupPruneResult = {
  /** Folders that were actually removed, oldest-first. */
  pruned: string[];
  /** Folders the policy selected but the filesystem refused to remove. */
  failures: BackupFailure[];
};

/**
 * Delete the folders the policy rejects, oldest-first.
 *
 * A dated folder is a full copy, so removing it can never orphan a file a
 * surviving snapshot needs. Only folders carrying a valid marker are touched:
 * a name match alone is not enough to delete someone else's directory.
 */
export const pruneBackups = (
  backupsRootPath: string,
  dates: readonly string[],
  policy: BackupRetentionPolicy,
  logger: BackupLogger,
  at: Date,
): BackupPruneResult => {
  const toPrune = selectBackupsToPrune(dates, policy);
  const pruned: string[] = [];
  const failures: BackupFailure[] = [];

  for (const date of toPrune) {
    const directory = join(backupsRootPath, date);
    // Defense in depth: the caller lists only usable snapshots, but deletion
    // must never depend on a name having matched.
    if (!isUsableSnapshot(directory)) continue;

    try {
      rmSync(directory, { recursive: true, force: true });
      pruned.push(date);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`[backup] could not prune ${directory}; keeping it`, error);
      failures.push({ at: at.toISOString(), reason: `could not prune ${date}: ${reason}` });
    }
  }
  return { pruned, failures };
};

/**
 * Seed the status from the newest on-disk backup so `backupStatus` is useful
 * after a restart on a day when no run is due (`lastSuccessAt` = folder mtime,
 * the closest truthful timestamp without a manifest file).
 */
const seedStatusFromDisk = (
  backupsRootPath: string,
  at: Date,
  logger: BackupLogger,
): {
  lastBackupPath: string | null;
  lastSuccessAt: string | null;
  lastFailure: BackupFailure | null;
} => {
  try {
    const dates = listBackupDates(backupsRootPath, at);
    if (dates.length === 0) {
      return { lastBackupPath: null, lastSuccessAt: null, lastFailure: null };
    }

    const newest = join(backupsRootPath, dates[dates.length - 1]!);
    return {
      lastBackupPath: newest,
      lastSuccessAt: statSync(newest).mtime.toISOString(),
      lastFailure: null,
    };
  } catch (error) {
    // `isDirectory` can succeed while `readdirSync`/`statSync` still throw
    // (permission denied, a transient lock). This read runs while the service
    // is being constructed, so an escaping throw is a failed boot — the exact
    // thing the feature forbids. Degrade to "no backups, with a recorded
    // failure" instead.
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(
      `[backup] cannot read backups root ${backupsRootPath}: ${reason}`,
      error,
    );
    return {
      lastBackupPath: null,
      lastSuccessAt: null,
      lastFailure: { at: at.toISOString(), reason },
    };
  }
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

  const seeded = seedStatusFromDisk(deps.backupsRootPath, now(), logger);
  let lastBackupPath = seeded.lastBackupPath;
  let lastSuccessAt = seeded.lastSuccessAt;
  let lastFailure: BackupFailure | null = seeded.lastFailure;

  const runDueBackup = async (): Promise<BackupRunResult> => {
    const runAt = now();
    const date = formatBackupDate(previousDay(runAt));

    let stagingDirectory: string | null = null;
    try {
      // Preflight (stale-staging cleanup, listing, the due check) lives INSIDE
      // the guarded region: a throw here must record a failure, not escape the
      // service while `lastFailure` stays null and the status reads healthy.
      removeStaleStagingEntries(deps.backupsRootPath);

      const existingDates = listBackupDates(deps.backupsRootPath, runAt);
      const newest =
        existingDates.length > 0
          ? existingDates[existingDates.length - 1]!
          : null;
      if (!isBackupDue(newest, runAt)) return { status: "not-due" };

      const targetDirectory = join(deps.backupsRootPath, date);
      mkdirSync(deps.backupsRootPath, { recursive: true });

      // A folder already sitting at the target name is NOT necessarily an
      // incomplete snapshot of ours: the root can be a shared directory, and
      // this feature only ever touches folders it created. Never delete it;
      // renaming onto it is impossible, so fail loudly with the reason on the
      // status instead of clobbering someone else's data.
      if (existsSync(targetDirectory)) {
        throw new Error(
          `refusing to overwrite ${targetDirectory}: it is not a Tuari snapshot`,
        );
      }

      stagingDirectory = mkdtempSync(
        join(deps.backupsRootPath, BACKUP_STAGING_PREFIX),
      );

      const snapshot = await deps.snapshot(
        join(stagingDirectory, BACKUP_DB_FILE_NAME),
      );

      // The marker is written while the copy is still in staging, so a dated
      // folder that exists is always complete AND identified as ours.
      const marker: SnapshotMarker = {
        app: BACKUP_MARKER_APP,
        format: BACKUP_MARKER_FORMAT,
        schemaVersion: snapshot.schemaVersion,
        databaseFile: BACKUP_DB_FILE_NAME,
        encrypted: snapshot.encrypted,
        takenAt: runAt.toISOString(),
      };
      writeFileSync(
        join(stagingDirectory, BACKUP_MARKER_FILE_NAME),
        JSON.stringify(marker),
      );

      renameSync(stagingDirectory, targetDirectory);
      stagingDirectory = null;

      lastBackupPath = targetDirectory;
      lastSuccessAt = runAt.toISOString();
      lastFailure = null;
      logger.info(`[backup] created ${targetDirectory} for ${date}`);

      const prune = pruneBackups(
        deps.backupsRootPath,
        [...existingDates, date],
        policy,
        logger,
        runAt,
      );
      // A prune the filesystem refused is a real problem (the disk is filling
      // up), so it is surfaced on the SAME failure field the snapshot uses —
      // it must not be swallowed by a log line only.
      if (prune.failures.length > 0) lastFailure = prune.failures[0]!;

      return { status: "created", date, path: targetDirectory };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // Cleanup must never replace the real failure. If removing the staging
      // dir also fails, that is logged, and the ORIGINAL reason stays on the
      // status and the returned result.
      if (stagingDirectory !== null) {
        try {
          rmSync(stagingDirectory, { recursive: true, force: true });
        } catch (cleanupError) {
          logger.error(
            `[backup] could not remove staging ${stagingDirectory}`,
            cleanupError,
          );
        }
      }

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
