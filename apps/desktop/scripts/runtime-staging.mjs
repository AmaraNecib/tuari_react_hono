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
 * built (#409). The pid is also the ownership key: recovery and the sweep only
 * touch a backup whose owning process is gone (see `isAbandonedBackup`).
 */
const backupDirName = (destinationDir, { now, pid }) =>
  `${destinationDir}${BACKUP_INFIX}${now()}-${pid}`;

/**
 * Parse a backup's recency and owner. New names are `<epoch>-<pid>`; legacy
 * pid-only names parse as `<pid>` for both, so they still sort before every
 * timestamped backup (correct: they predate this build). An unparseable owner
 * becomes `null`, which `isAbandonedBackup` treats as live.
 */
const parseBackupName = (name, prefix) => {
  const parts = name.slice(prefix.length).split("-");
  const recency = Number(parts[0]);
  const ownerCandidate = parts.length > 1 ? Number(parts[parts.length - 1]) : Number(parts[0]);

  return {
    name,
    recency: Number.isFinite(recency) ? recency : Number.NEGATIVE_INFINITY,
    ownerPid: Number.isInteger(ownerCandidate) && ownerCandidate > 0 ? ownerCandidate : null,
  };
};

/**
 * Default liveness probe: signal 0 tests for a process without signalling it.
 * `ESRCH` means gone; `EPERM` means it exists but may not be signalled, which
 * is still alive.
 */
const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
};

/**
 * True only when no other live process can still own the backup, so recovery
 * and the sweep may move or delete it.
 *
 * Two builds can run at once: one renames the destination aside to
 * `<dest>.previous-<epoch>-<pid>` before publishing. The other must not treat
 * that in-flight backup as litter, or the first build loses the tree it needs
 * to roll back (#409). So a backup is abandoned only when its owner is gone.
 *
 * A backup whose pid is OUR OWN cannot belong to a concurrent build (a pid
 * names one live process), so it is litter from an earlier incarnation of this
 * process and is recoverable. Any other pid is abandoned only when that
 * process is gone. An unparseable owner is never abandoned: a backup we cannot
 * prove is dead must stay.
 */
const isAbandonedBackup = (ownerPid, { isAlive, pid }) => {
  if (ownerPid === null) return false;
  if (ownerPid === pid) return true;

  return !isAlive(ownerPid);
};

/**
 * Every ABANDONED `<destinationDir>.previous-*` sibling, newest first. A clean
 * run removes its own backup, so anything found here is litter from an
 * interrupted or crashed run; callers take the first entry as the most recent
 * runtime to recover. A backup owned by a still-running build is skipped
 * entirely, so it can neither be restored nor swept.
 */
const findAbandonedRuntimeBackups = ({ destinationDir, exists, readdir, isAlive, pid }) => {
  const parentDir = path.dirname(destinationDir);

  if (!exists(parentDir)) {
    return [];
  }

  const prefix = `${path.basename(destinationDir)}${BACKUP_INFIX}`;

  return readdir(parentDir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => parseBackupName(name, prefix))
    .filter((backup) => isAbandonedBackup(backup.ownerPid, { isAlive, pid }))
    .sort((a, b) => b.recency - a.recency)
    .map((backup) => path.join(parentDir, backup.name));
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
 * that state is found (destination missing, ABANDONED backups present) the
 * NEWEST abandoned backup is restored first and `log` reports what was found
 * and what was done, so the next build recovers on its own and a failed publish
 * still restores a runnable runtime. Backups left by earlier runs are removed
 * after the next successful publish, so they never require a human to delete
 * directories.
 *
 * Recovery and the sweep only ever touch a backup whose owning process is gone
 * (`isAbandonedBackup`): two builds can overlap, and one must not steal or
 * delete the runtime the other has renamed aside mid-publish. A backup owned by
 * a live process is left exactly where it is.
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
  isAlive = isProcessAlive,
}) => {
  const backupDir = backupDirName(destinationDir, { now, pid });
  const leftovers = findAbandonedRuntimeBackups({ destinationDir, exists, readdir, isAlive, pid });
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
  isAlive = isProcessAlive,
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
        isAlive,
      });
    }
  } finally {
    remove(stagingDir, { recursive: true, force: true });
  }
};
