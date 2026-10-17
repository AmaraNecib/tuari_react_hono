/**
 * Backup scheduling + retention policy (#430).
 *
 * Pure functions only: every decision that involves the clock or the set of
 * existing backups is here so it can be pinned without touching the disk.
 */

/**
 * Retention policy: how many backups to keep at each granularity.
 *
 * Grandfather-father-son: the newest 14 folders are kept daily, then one folder
 * per ISO week for the newest 8 weeks, then one per calendar month for the
 * newest 6 months. That is roughly a six-month horizon for ~28 folders.
 *
 * This is a single constant on purpose. Without a policy the backups become the
 * thing that fills the disk; if a number here changes, it changes in one place.
 */
export const BACKUP_RETENTION = {
  daily: 14,
  weekly: 8,
  monthly: 6,
} as const;

export type BackupRetentionPolicy = {
  daily: number;
  weekly: number;
  monthly: number;
};

/**
 * Folder name of one backup: the period the backup covers (`YYYY-MM-DD`).
 *
 * Mirrored by `apps/desktop/scripts/sqlcipher-encryption-proof.mjs`
 * (`findSnapshotDatabase`), together with the `tuari.sqlite` and
 * `snapshot.json` names owned by `backup.service.ts`. Change both sides: the
 * proof fails closed, so a rename here turns the encryption gate red.
 */
export const BACKUP_DIRECTORY_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Steps taken by a run in progress; ignored by listing and retention. */
export const BACKUP_STAGING_PREFIX = ".staging-";

/** Format a local calendar day as the backup folder name. */
export const formatBackupDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Midnight at the start of the previous local calendar day. */
export const previousDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

/**
 * Is a backup due?
 *
 * A backup is named for the period that just ended (yesterday), so it is due
 * when the newest existing folder is older than yesterday — first run, or the
 * first start on a day after at least one uncovered day. Comparing calendar
 * days (not elapsed hours) means at most one backup per day and no DST trap.
 *
 * A folder dated in the FUTURE is not credible (a laptop clock that was set
 * years ahead, a hand-made directory). Treating it as "newer than yesterday"
 * would suppress every backup until that date arrives, so it counts as no
 * usable snapshot and a fresh one is taken now.
 */
export const isBackupDue = (newestDate: string | null, now: Date): boolean => {
  if (newestDate === null) return true;
  if (newestDate > formatBackupDate(now)) return true;
  return newestDate < formatBackupDate(previousDay(now));
};

/** Keep the newest folder per bucket key, newest bucket first, up to `limit`. */
const pickNewestPerBucket = (
  dates: readonly string[],
  bucketKey: (date: string) => string,
  limit: number,
): string[] => {
  if (limit <= 0) return [];

  const chosen: string[] = [];
  const seen = new Set<string>();
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const date = dates[index]!;
    const key = bucketKey(date);
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(date);
    if (chosen.length >= limit) break;
  }
  return chosen;
};

/** ISO-8601 week key (`2026-W03`), so week boundaries are not locale-dependent. */
const isoWeekKey = (date: string): string => {
  const [yearText, monthText, dayText] = date.split("-");
  const target = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
  const dayNumber = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const monthKey = (date: string): string => date.slice(0, 7);

/**
 * Select the backups to delete for a policy.
 *
 * Keeps the newest folder unconditionally, then the newest `daily` folders,
 * then the newest folder of each of the newest `weekly` weeks, then the newest
 * folder of each of the newest `monthly` months. Everything else is returned in
 * ascending (oldest-first) order; the caller deletes those folders.
 */
export const selectBackupsToPrune = (
  dates: readonly string[],
  policy: BackupRetentionPolicy = BACKUP_RETENTION,
): string[] => {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return [];

  const keep = new Set<string>();
  // Never prune the newest backup, whatever the policy says.
  keep.add(sorted[sorted.length - 1]!);

  sorted
    .slice(Math.max(0, sorted.length - policy.daily))
    .forEach((date) => keep.add(date));

  const older = sorted.slice(0, Math.max(0, sorted.length - policy.daily));
  pickNewestPerBucket(older, isoWeekKey, policy.weekly).forEach((date) =>
    keep.add(date),
  );

  const afterWeekly = older.filter((date) => !keep.has(date));
  pickNewestPerBucket(afterWeekly, monthKey, policy.monthly).forEach((date) =>
    keep.add(date),
  );

  return sorted.filter((date) => !keep.has(date));
};
