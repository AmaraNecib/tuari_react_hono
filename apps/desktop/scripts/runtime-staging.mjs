import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/** Infix shared by the tree a swap renames aside and the recovery scan for it. */
const BACKUP_INFIX = ".previous-";

/** Sibling file that records which build owns a backup tree. */
export const OWNER_MARKER_SUFFIX = ".owner";

/**
 * How long an ownership marker stays fresh without a heartbeat. One swap is a
 * handful of synchronous renames, far inside this, so the lease only elapses
 * when the owning build died or stalled; at that point the next build may
 * recover the tree.
 */
const DEFAULT_MARKER_LEASE_MS = 30_000;

/**
 * Name this run's backup `<destination>.previous-<epochMs>-<pid>`.
 *
 * The epoch millisecond is the recency signal recovery sorts by. A pid alone
 * is not one — pids are reused and wrap — which is why the old name-only sort
 * could restore an older runtime than the one an interrupted run had just
 * built (#409).
 */
const backupDirName = (destinationDir, { now, pid }) =>
  `${destinationDir}${BACKUP_INFIX}${now()}-${pid}`;

/** Recency key for a backup name `<prefix><epochMs>-<pid>` (or legacy `<pid>`). */
const backupRecency = (name, prefix) => {
  const [leading] = name.slice(prefix.length).split("-");
  const value = Number(leading);

  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

/** Sibling ownership-marker path for a backup tree. */
export const ownerMarkerPath = (backupDir) => `${backupDir}${OWNER_MARKER_SUFFIX}`;

/**
 * Write (or refresh) a backup's ownership marker: the owning build's pid and
 * start time plus the heartbeat the staleness check reads.
 */
export const writeOwnerMarker = (backupDir, marker, { write = writeFileSync } = {}) => {
  write(ownerMarkerPath(backupDir), JSON.stringify(marker), "utf8");
};

/**
 * Read a backup's ownership marker, or `null` when there is none.
 *
 * Freshness is the heartbeat written into the file, with the file's mtime as a
 * fallback: a reader that catches a partial write still sees the refreshed
 * mtime, so a live owner is never mistaken for a dead one. Identity (the pid)
 * is best-effort; an unparseable marker yields `pid: null`, which the
 * abandonment test keeps while it is fresh.
 */
export const readOwnerMarker = (backupDir, { read = readFileSync, stat = statSync } = {}) => {
  const markerPath = ownerMarkerPath(backupDir);
  let markerStat;

  try {
    markerStat = stat(markerPath);
  } catch {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(read(markerPath, "utf8"));
  } catch {
    // Fall back to the mtime as the heartbeat.
  }

  const contentHeartbeat = Number.isFinite(parsed?.heartbeatAt) ? Number(parsed.heartbeatAt) : null;

  return {
    pid: Number.isInteger(parsed?.pid) && parsed.pid > 0 ? parsed.pid : null,
    startedAt: Number.isFinite(parsed?.startedAt) ? Number(parsed.startedAt) : null,
    heartbeatAt: contentHeartbeat ?? markerStat.mtimeMs,
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
 * True only when no live build can still own the backup, so recovery and the
 * sweep may move or delete it.
 *
 * The ownership signal is the MARKER, not the pid: a pid is reused, so a live
 * process that merely inherited a dead build's pid must not keep an abandoned
 * backup frozen, or recovery can be blocked and the machine left with no
 * runtime (#409). A build refreshes its marker as it swaps; if it dies the
 * heartbeat stops and the marker goes stale.
 *
 * - no marker (or a corrupt one) -> abandoned
 * - heartbeat older than the lease -> abandoned (the primary signal)
 * - fresh but the owner pid is gone -> abandoned (the pid probe is a tiebreaker
 *   that recovers a crashed owner before the lease even elapses)
 * - fresh with an unknown or a live owner -> owned; never steal it
 */
export const isAbandonedBackup = (marker, { now, markerLeaseMs, isAlive }) => {
  if (marker === null) return true;
  if (!Number.isFinite(marker.heartbeatAt)) return true;
  if (now() - marker.heartbeatAt > markerLeaseMs) return true;
  if (marker.pid === null) return false;

  return !isAlive(marker.pid);
};

/**
 * Every ABANDONED `<destinationDir>.previous-*` sibling, newest first. A clean
 * run removes its own backup, so anything found here is litter from an
 * interrupted or crashed run; callers take the first entry as the most recent
 * runtime to recover. A backup whose marker is still fresh belongs to a running
 * build and is skipped entirely, so it can be neither restored nor swept.
 */
const findAbandonedRuntimeBackups = ({
  destinationDir,
  exists,
  readdir,
  readMarker,
  now,
  markerLeaseMs,
  isAlive,
}) => {
  const parentDir = path.dirname(destinationDir);

  if (!exists(parentDir)) {
    return [];
  }

  const prefix = `${path.basename(destinationDir)}${BACKUP_INFIX}`;

  return readdir(parentDir)
    .filter((name) => name.startsWith(prefix) && !name.endsWith(OWNER_MARKER_SUFFIX))
    .map((name) => ({ name, recency: backupRecency(name, prefix) }))
    .filter((backup) =>
      isAbandonedBackup(readMarker(path.join(parentDir, backup.name)), { now, markerLeaseMs, isAlive }),
    )
    .sort((a, b) => b.recency - a.recency)
    .map((backup) => path.join(parentDir, backup.name));
};

/**
 * Claim a backup for this build by writing its ownership marker, and return a
 * `beat` that refreshes the marker as the swap progresses.
 *
 * The marker is the primary ownership signal; the pid it carries is only a
 * tiebreaker. A live build can beat, a dead one cannot, so a reused pid cannot
 * keep an abandoned backup frozen.
 *
 * The INITIAL write is FATAL and must land before the destination is renamed
 * aside. With no marker on disk an overlapping build reads the backup as
 * abandoned and may restore or sweep the tree this build just set aside,
 * leaving it without the runtime it needs for rollback. A build that cannot
 * claim ownership therefore must not start the swap.
 *
 * A refresh failure AFTER that is not fatal: the swap has already begun, the
 * marker written here ages from its last successful heartbeat, and the live
 * owner's pid keeps protecting the tree until the lease expires. Only the first
 * failure in a run warns, so a persistently failing refresh stays visible
 * without warning on every beat.
 */
export const claimBackupOwnership = ({ backupDir, pid, now, writeMarker, warn }) => {
  const startedAt = now();

  try {
    writeMarker(backupDir, { pid, startedAt, heartbeatAt: startedAt });
  } catch (error) {
    throw new Error(
      `Could not claim ownership of the runtime backup at ${ownerMarkerPath(backupDir)}: `
      + (error instanceof Error ? error.message : String(error)),
    );
  }

  let refreshFailed = false;

  return (heartbeatAt = now()) => {
    try {
      writeMarker(backupDir, { pid, startedAt, heartbeatAt });
      refreshFailed = false;
    } catch (error) {
      if (refreshFailed) return;
      refreshFailed = true;
      warn(
        `Could not refresh the runtime backup ownership marker at ${ownerMarkerPath(backupDir)}: `
        + (error instanceof Error ? error.message : String(error)),
      );
    }
  };
};

/** Remove a backup's ownership marker; cleanup-only, so a failure only warns. */
const removeOwnerMarker = (backupDir, { remove, warn }) => {
  try {
    remove(ownerMarkerPath(backupDir), { force: true });
  } catch (error) {
    warn(
      `Could not remove the runtime backup ownership marker at ${ownerMarkerPath(backupDir)}: `
      + (error instanceof Error ? error.message : String(error)),
    );
  }
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
 * tree" leaves no destination plus a `.previous-<epoch>-<pid>` backup carrying
 * its ownership marker. When that state is found (destination missing, an
 * ABANDONED backup present) the NEWEST abandoned backup is restored first and
 * `log` reports what was found and what was done, so the next build recovers on
 * its own and a failed publish still restores a runnable runtime. Backups left
 * by earlier runs are removed after the next successful publish, so they never
 * require a human to delete directories.
 *
 * Recovery and the sweep only ever touch a backup whose marker is stale or
 * absent (`isAbandonedBackup`): two builds can overlap, and one must not steal
 * or delete the runtime the other has renamed aside mid-publish. A backup with
 * a fresh marker is left exactly where it is, even if its pid is not alive.
 *
 * Because that protection depends on the marker existing, claiming ownership is
 * fatal: a build that cannot write the marker throws BEFORE the destination is
 * renamed aside, leaving the previous runtime untouched.
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
  readMarker = readOwnerMarker,
  writeMarker = writeOwnerMarker,
  markerLeaseMs = DEFAULT_MARKER_LEASE_MS,
}) => {
  const backupDir = backupDirName(destinationDir, { now, pid });
  const leftovers = findAbandonedRuntimeBackups({
    destinationDir,
    exists,
    readdir,
    readMarker,
    now,
    markerLeaseMs,
    isAlive,
  });
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
      removeOwnerMarker(recoveredBackup, { remove, warn });
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

  if (!hadDestination) {
    rename(stagingDir, destinationDir);
    return;
  }

  try {
    // Claim ownership BEFORE renaming the destination aside: a build that
    // cannot write the marker must not start the swap, or an overlapping build
    // could treat its backup as abandoned and steal it mid-publish.
    const beat = claimBackupOwnership({ backupDir, pid, now, writeMarker, warn });

    // A re-run in the same millisecond with the same pid reuses this backup
    // name; clear it first so the rename cannot fail against a non-empty
    // directory.
    remove(backupDir, { recursive: true, force: true });
    rename(destinationDir, backupDir);
    // Refresh the lease at the boundary that matters: the publish rename is the
    // step that can block on a locked file.
    beat();

    try {
      rename(stagingDir, destinationDir);
    } catch (error) {
      rename(backupDir, destinationDir);
      throw error;
    }

    removeAfterPublish(backupDir, "the runtime this build replaced");
  } finally {
    removeOwnerMarker(backupDir, { remove, warn });
  }

  for (const leftover of leftovers) {
    if (leftover === backupDir || leftover === recoveredBackup) {
      continue;
    }

    removeAfterPublish(leftover, "a runtime left by an interrupted run");
    removeOwnerMarker(leftover, { remove, warn });
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
  readMarker = readOwnerMarker,
  writeMarker = writeOwnerMarker,
  markerLeaseMs = DEFAULT_MARKER_LEASE_MS,
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
        readMarker,
        writeMarker,
        markerLeaseMs,
      });
    }
  } finally {
    remove(stagingDir, { recursive: true, force: true });
  }
};
