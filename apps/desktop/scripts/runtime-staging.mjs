import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

/** Infix shared by the tree a swap renames aside and the recovery scan for it. */
const BACKUP_INFIX = ".previous-";

/**
 * Name this run's backup `<destination>.previous-<epochMs>-<pid>`.
 *
 * The epoch millisecond is the recency signal recovery sorts by. A pid alone
 * is not one — pids are reused and wrap — which is why the old name-only sort
 * could restore an older runtime than the one an interrupted run had just
 * built (#409). The pid keeps two builds that start in the same millisecond
 * distinct.
 */
const backupDirName = (destinationDir, { now, pid }) =>
  `${destinationDir}${BACKUP_INFIX}${now()}-${pid}`;

/**
 * Recency key for a backup name. New names carry an epoch-millisecond prefix
 * (`<epoch>-<pid>`); legacy pid-only names parse as their own number and so
 * sort before every timestamped backup, which is the right order because they
 * predate this build.
 */
const backupRecency = (name, prefix) => {
  const [leading] = name.slice(prefix.length).split("-");
  const value = Number(leading);

  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

/**
 * Every `<destinationDir>.previous-*` sibling left behind by a swap that did
 * not finish, newest first. A clean run removes its own backup, so anything
 * found here is litter from an interrupted or crashed run; callers take the
 * first entry as the most recent runtime to recover.
 */
const findPreviousRuntimeBackups = ({ destinationDir, exists, readdir }) => {
  const parentDir = path.dirname(destinationDir);

  if (!exists(parentDir)) {
    return [];
  }

  const prefix = `${path.basename(destinationDir)}${BACKUP_INFIX}`;

  return readdir(parentDir)
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => backupRecency(b, prefix) - backupRecency(a, prefix))
    .map((name) => path.join(parentDir, name));
};

/**
 * Move a fully built runtime tree into place, preserving the previous tree if
 * anything goes wrong.
 *
 * The previous directory is renamed aside before the staged one lands, so a
 * failure during the swap restores it instead of leaving a half-copied tree.
 * The staged directory must share a volume with the destination for the rename
 * to be atomic; `build-sidecar.mjs` stages under `src-tauri/` for that reason.
 *
 * A run killed between "rename the old tree aside" and "publish the staged
 * tree" leaves no destination plus a `.previous-<epoch>-<pid>` backup. When
 * that state is found (destination missing, backups present) the NEWEST backup
 * is restored first and `log` reports what was found and what was done, so the
 * next build recovers on its own and a failed publish still restores a runnable
 * runtime. Backups left by earlier runs are removed after the next successful
 * publish, so they never require a human to delete directories.
 *
 * Removing the renamed-aside previous tree happens AFTER the staged tree is
 * live. A failure there does not undo the publish, so it is reported with
 * `warn` (naming the live destination and the leftover directory) instead of
 * thrown: a non-zero exit that means "the runtime was replaced anyway" is the
 * misreading this avoids. A failure clearing a stale backup BEFORE the swap is
 * still thrown — nothing has been published at that point.
 */
export const swapRuntimeDirectory = ({
  stagingDir,
  destinationDir,
  rename = renameSync,
  remove = rmSync,
  exists = existsSync,
  readdir = readdirSync,
  warn = console.warn,
  log = console.log,
  now = Date.now,
  pid = process.pid,
}) => {
  const backupDir = backupDirName(destinationDir, { now, pid });
  const leftovers = findPreviousRuntimeBackups({ destinationDir, exists, readdir });
  let recoveredBackup = null;

  if (!exists(destinationDir)) {
    recoveredBackup = leftovers[0] ?? null;

    if (recoveredBackup) {
      log(
        [
          `Found no published runtime at ${destinationDir}, and an interrupted run left one aside at ${recoveredBackup}.`,
          `Restoring ${recoveredBackup} before publishing the staged runtime, so a failed publish still leaves a runnable runtime.`,
        ].join("\n"),
      );
      rename(recoveredBackup, destinationDir);
    }
  }

  const removeAfterPublish = (target, label) => {
    try {
      remove(target, { recursive: true, force: true });
    } catch (error) {
      warn(
        [
          `Published the staged runtime, but could not remove ${label}.`,
          `  published (live now): ${destinationDir}`,
          `  leftover (inactive):  ${target}`,
          `  cause:                ${error instanceof Error ? error.message : String(error)}`,
          "The runtime WAS replaced; this is cleanup-only, so the build is not failed.",
          "Delete the leftover directory once nothing holds it open.",
        ].join("\n"),
      );
    }
  };

  const hadDestination = exists(destinationDir);

  if (hadDestination) {
    // A re-run in the same millisecond with the same pid reuses this backup
    // name; clear it first so the rename cannot fail against a non-empty
    // directory.
    remove(backupDir, { recursive: true, force: true });
    rename(destinationDir, backupDir);
  }

  try {
    rename(stagingDir, destinationDir);
  } catch (error) {
    if (hadDestination) {
      rename(backupDir, destinationDir);
    }

    throw error;
  }

  if (!hadDestination) {
    return;
  }

  removeAfterPublish(backupDir, "the runtime this build replaced");

  for (const leftover of leftovers) {
    if (leftover === backupDir || leftover === recoveredBackup) {
      continue;
    }

    removeAfterPublish(leftover, "a runtime left by an interrupted run");
  }
};

/**
 * Build a replacement runtime in `stagingDir`, prove it works with `probe`, and
 * only then publish it. `publish: false` (the ephemeral typecheck path) probes
 * and discards.
 *
 * The build and probe run BEFORE the swap, and the staging tree is removed on
 * every path, so a failed build or probe leaves the existing runtime
 * byte-for-byte intact rather than deleting it first (#409). The swap recovers
 * a runtime stranded by its own interrupted run, and once it has published, a
 * cleanup failure is warned about instead of thrown (see
 * `swapRuntimeDirectory`): the new runtime is live either way, and a failure
 * exit there would misreport that.
 */
export const buildProbeAndPublishRuntime = ({
  stagingDir,
  destinationDir,
  build,
  probe,
  publish = true,
  rename = renameSync,
  remove = rmSync,
  exists = existsSync,
  readdir = readdirSync,
  warn = console.warn,
  log = console.log,
  now = Date.now,
  pid = process.pid,
}) => {
  try {
    build();
    probe();

    if (publish) {
      swapRuntimeDirectory({
        stagingDir,
        destinationDir,
        rename,
        remove,
        exists,
        readdir,
        warn,
        log,
        now,
        pid,
      });
    }
  } finally {
    remove(stagingDir, { recursive: true, force: true });
  }
};
