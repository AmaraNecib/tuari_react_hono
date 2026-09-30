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
import type { Dirent } from "node:fs";
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
  // The real ISO timestamp the snapshot was taken. Validated as a datetime (not
  // just non-empty) because it is surfaced as `lastSuccessAt`/`takenAt` on the
  // wire, whose schema is `timestampSchema`; a marker that cannot be a
  // timestamp is not one of ours.
  takenAt: z.string().datetime({ offset: true }),
});

type SnapshotMarker = z.infer<typeof snapshotMarkerSchema>;

const isBackupDirectory = (name: string): boolean =>
  BACKUP_DIRECTORY_NAME_PATTERN.test(name);

/**
 * A non-empty string explaining why something failed.
 *
 * Every recorded failure reason feeds `lastFailure.reason`, whose wire schema
 * is `.min(1)`. A thrown `""` or an `Error` with an empty message would
 * otherwise make `backupStatus` fail output validation (a 500) instead of
 * reporting the failure, so empty reasons are normalized here.
 */
const failureReason = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)) ||
  "unknown backup failure";

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
    const database = statSync(join(directory, BACKUP_DB_FILE_NAME));
    // `isFile` matters: a *directory* named `tuari.sqlite` is not a copy, and
    // for an encrypted marker the plaintext header check is skipped, so a size
    // check alone would accept it.
    return database.isFile() && database.size > 0;
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
 * The marker of a folder that is a usable snapshot, or null when it is not ours
 * or not usable. A usable snapshot must carry a valid marker AND a non-empty
 * database file. A plaintext snapshot must also start with the SQLite magic, so
 * a marker next to a junk/truncated file is rejected (a positive size alone does
 * not make a usable database). An encrypted copy's header is SQLCipher's, so
 * there the marker is the validity signal — and the worker ran `PRAGMA
 * integrity_check` on the copy when it was written.
 *
 * Returning the marker lets listing seed the status from the snapshot's real
 * `takenAt` without re-reading and re-validating the folder.
 */
const readUsableSnapshot = (directory: string): SnapshotMarker | null => {
  if (!hasSnapshotDatabase(directory)) return null;
  const marker = readSnapshotMarker(directory);
  if (marker === null) return null;
  if (!marker.encrypted && !hasSqliteHeader(join(directory, BACKUP_DB_FILE_NAME))) {
    return null;
  }
  return marker;
};

/** True when a dated folder is a snapshot this feature can list and prune. */
export const isUsableSnapshot = (directory: string): boolean =>
  readUsableSnapshot(directory) !== null;

type UsableSnapshot = {
  /** Folder name: the `YYYY-MM-DD` period the snapshot covers. */
  date: string;
  /** Absolute path of the dated folder. */
  path: string;
  /** The validated marker, carrying the real `takenAt`. */
  marker: SnapshotMarker;
};

/**
 * Existing usable dated snapshot folders, ascending (oldest first).
 *
 * `now` (when given) drops folders dated in the future: a snapshot written
 * under a clock that was set ahead must not count as the newest (it would
 * suppress every backup until its date arrived, and it would hold the newest
 * retention slot against the fresh copy).
 */
const listUsableSnapshots = (
  backupsRootPath: string,
  now?: Date,
): UsableSnapshot[] => {
  if (!isDirectory(backupsRootPath)) return [];

  const ceiling = now === undefined ? null : formatBackupDate(now);
  return readdirSync(backupsRootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isBackupDirectory(entry.name))
    .filter((entry) => ceiling === null || entry.name <= ceiling)
    .flatMap((entry) => {
      const path = join(backupsRootPath, entry.name);
      const marker = readUsableSnapshot(path);
      return marker === null ? [] : [{ date: entry.name, path, marker }];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
};

/** Existing usable dated backup folder names, ascending (oldest first). */
export const listBackupDates = (
  backupsRootPath: string,
  now?: Date,
): string[] =>
  listUsableSnapshots(backupsRootPath, now).map((snapshot) => snapshot.date);

/**
 * Artifacts a crashed staging run can leave behind. A `.staging-*` folder is
 * only swept when every entry is one of these (or the folder is empty), so a
 * foreign directory that merely shares the prefix survives.
 */
const STAGING_ARTIFACTS = new Set([
  BACKUP_DB_FILE_NAME,
  BACKUP_MARKER_FILE_NAME,
  `${BACKUP_DB_FILE_NAME}-wal`,
  `${BACKUP_DB_FILE_NAME}-shm`,
  `${BACKUP_DB_FILE_NAME}-journal`,
]);

/**
 * True only for a `.staging-*` directory this feature (or a crashed run of it)
 * created: empty, or holding nothing but known snapshot artifacts. An
 * unreadable folder is left alone rather than guessed at.
 */
const isOwnStagingDirectory = (
  backupsRootPath: string,
  entry: Dirent,
): boolean => {
  if (!entry.isDirectory()) return false;
  try {
    return readdirSync(join(backupsRootPath, entry.name)).every((child) =>
      STAGING_ARTIFACTS.has(child),
    );
  } catch {
    return false;
  }
};

/** Remove `.staging-*` folders a crashed previous run left behind. */
const removeStaleStagingEntries = (backupsRootPath: string): void => {
  if (!isDirectory(backupsRootPath)) return;

  for (const entry of readdirSync(backupsRootPath, { withFileTypes: true })) {
    if (!entry.name.startsWith(BACKUP_STAGING_PREFIX)) continue;
    if (!isOwnStagingDirectory(backupsRootPath, entry)) continue;
    rmSync(join(backupsRootPath, entry.name), { recursive: true, force: true });
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
    // No clock ceiling here: the status reports the newest snapshot actually
    // on disk (including one a corrected clock left in the future), while the
    // due check and retention still ignore non-credible future dates.
    const snapshots = listUsableSnapshots(backupsRootPath);
    if (snapshots.length === 0) {
      return { lastBackupPath: null, lastSuccessAt: null, lastFailure: null };
    }

    const newest = snapshots[snapshots.length - 1]!;
    return {
      lastBackupPath: newest.path,
      lastSuccessAt: newest.marker.takenAt,
      lastFailure: null,
    };
  } catch (error) {
    // `isDirectory` can succeed while `readdirSync`/`statSync` still throw
    // (permission denied, a transient lock). This read runs while the service
    // is being constructed, so an escaping throw is a failed boot — the exact
    // thing the feature forbids. Degrade to "no backups, with a recorded
    // failure" instead.
    const reason = failureReason(error);
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

  // The root is mutable so the owner can point the next run at another disk
  // (#436). Every read below goes through this variable, never `deps`.
  let backupsRootPath = deps.backupsRootPath;
  const seeded = seedStatusFromDisk(backupsRootPath, now(), logger);
  let lastBackupPath = seeded.lastBackupPath;
  let lastSuccessAt = seeded.lastSuccessAt;
  let lastFailure: BackupFailure | null = seeded.lastFailure;
  // A failure recorded while the service was being constructed (the root was
  // unreadable at boot) is not a backup run. It is cleared as soon as the root
  // proves readable again, so a recoverable boot problem does not pin a
  // permanent failure on the status. A failure from an actual run is never
  // seeded and is left intact.
  let lastFailureIsSeeded = seeded.lastFailure !== null;

  const runDueBackup = async (): Promise<BackupRunResult> => {
    const runAt = now();
    const date = formatBackupDate(previousDay(runAt));

    let stagingDirectory: string | null = null;
    try {
      // Preflight (stale-staging cleanup, listing, the due check) lives INSIDE
      // the guarded region: a throw here must record a failure, not escape the
      // service while `lastFailure` stays null and the status reads healthy.
      removeStaleStagingEntries(backupsRootPath);

      const existingDates = listBackupDates(backupsRootPath, runAt);
      // The root proved readable, so a failure seeded at construction is
      // stale. Clear it before the due check — a not-due start must still be
      // able to report a clean status. A real run failure is not seeded, so
      // this leaves it alone.
      if (lastFailureIsSeeded) {
        lastFailure = null;
        lastFailureIsSeeded = false;
      }
      const newest =
        existingDates.length > 0
          ? existingDates[existingDates.length - 1]!
          : null;
      if (!isBackupDue(newest, runAt)) return { status: "not-due" };

      const targetDirectory = join(backupsRootPath, date);
      mkdirSync(backupsRootPath, { recursive: true });

      // A folder already sitting at the target name is NOT necessarily an
      // incomplete snapshot of ours: the root can be a shared directory, and
      // this feature only ever touches folders it created. A folder with no
      // marker is someone else's data, so refuse rather than clobber it.
      if (existsSync(targetDirectory)) {
        if (readSnapshotMarker(targetDirectory) === null) {
          throw new Error(
            `refusing to overwrite ${targetDirectory}: it is not a Tuari snapshot`,
          );
        }
        // It carries OUR marker, yet the run is due: a usable yesterday-dated
        // folder would have made `isBackupDue` return "not-due" above. So this
        // is a corrupt/partial snapshot of ours (a truncated copy, a marker
        // beside a junk file). Removing it loses no usable backup and stops it
        // from wedging every future start on "refusing to overwrite".
        rmSync(targetDirectory, { recursive: true, force: true });
      }

      stagingDirectory = mkdtempSync(
        join(backupsRootPath, BACKUP_STAGING_PREFIX),
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
        backupsRootPath,
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
      const reason = failureReason(error);

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
      lastFailureIsSeeded = false;
      logger.error(`[backup] failed for ${date}: ${reason}`, error);
      return { status: "failed", date, reason };
    }
  };

  /**
   * Repoint subsequent runs and the status at `path`. The caller has already
   * validated and persisted it; re-seeding from the new root makes the screen
   * describe what is actually there (usually "no backups yet") rather than the
   * folder the owner just navigated away from.
   */
  const setBackupsRoot = (path: string): void => {
    backupsRootPath = path;
    const next = seedStatusFromDisk(backupsRootPath, now(), logger);
    lastBackupPath = next.lastBackupPath;
    lastSuccessAt = next.lastSuccessAt;
    lastFailure = next.lastFailure;
    lastFailureIsSeeded = next.lastFailure !== null;
  };

  return {
    runDueBackup,
    setBackupsRoot,
    getStatus: () => ({
      lastBackupPath,
      lastSuccessAt,
      lastFailure,
      backupsRootPath,
      retention: { ...policy },
    }),
  };
};
