import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Infix shared by the tree a swap renames aside and the recovery scan for it. */
const BACKUP_INFIX = ".previous-";

/** Sibling file that records which build owns a backup tree. */
export const OWNER_MARKER_SUFFIX = ".owner";

/**
 * How long an ownership marker stays fresh without a heartbeat. One swap is a
 * handful of synchronous renames, far inside this, so an elapsed lease means
 * the owning build stalled or died. The lease is the FALLBACK signal: the
 * owner process's start time decides ownership whenever it can be read (see
 * `isAbandonedBackup`), and the lease settles only the case where it cannot.
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

/** Linux `/proc` reports starttime in clock ticks; USER_HZ is 100 everywhere. */
const LINUX_CLOCK_TICKS_PER_SECOND = 100;

/**
 * Start time of a live process in milliseconds since the epoch, or `null` when
 * it cannot be read (an unsupported platform, or a probe that lacks
 * permission). `null` is NOT "the process is gone": `probeProcess` reports
 * existence separately, and `isAbandonedBackup` falls back to the heartbeat
 * lease only for the unreadable case.
 *
 * - Linux reads `/proc/<pid>/stat` field 22 (clock ticks since boot) plus
 *   `/proc/stat` `btime` (seconds since the epoch).
 * - Other POSIX reads `ps -o lstart= -p <pid>` (second resolution).
 * - Windows reads the process creation time through PowerShell, because there
 *   is no portable Node API and `wmic` is being removed.
 */
const readLinuxProcessStartTime = (pid) => {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  // `comm` (field 2) can contain spaces and parens, so parse from the last one.
  const commEnd = stat.lastIndexOf(")");
  if (commEnd === -1) return null;

  const fields = stat.slice(commEnd + 2).trim().split(/\s+/);
  // Field 22 overall; `comm` is field 2, so starttime is index 22 - 3 = 19.
  const startTicks = Number(fields[19]);
  if (!Number.isFinite(startTicks)) return null;

  const btimeLine = readFileSync("/proc/stat", "utf8")
    .split("\n")
    .find((line) => line.startsWith("btime "));
  const bootSeconds = Number(btimeLine?.slice("btime ".length));
  if (!Number.isFinite(bootSeconds)) return null;

  return (bootSeconds + startTicks / LINUX_CLOCK_TICKS_PER_SECOND) * 1000;
};

const readPsProcessStartTime = (pid) => {
  const output = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  }).trim();
  const startedAt = Date.parse(output);

  return Number.isFinite(startedAt) ? startedAt : null;
};

const readWindowsProcessStartTime = (pid) => {
  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$start = (Get-Process -Id ${Number(pid)} -ErrorAction Stop).StartTime.ToUniversalTime(); `
        + "[long](($start - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds)",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 },
  ).trim();
  const startedAt = Number(output);

  return Number.isFinite(startedAt) ? startedAt : null;
};

export const readProcessStartTime = (pid) => {
  try {
    const startedAt =
      process.platform === "win32"
        ? readWindowsProcessStartTime(pid)
        : process.platform === "linux"
          ? readLinuxProcessStartTime(pid)
          : readPsProcessStartTime(pid);

    // A positive, finite value or nothing. An empty probe output would parse as
    // 0, which must not be mistaken for a readable start time: that would make
    // every later-started process look like the owner.
    return Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null;
  } catch {
    // Unsupported platform or a permission failure: the caller falls back to
    // the heartbeat lease rather than guessing.
    return null;
  }
};

/**
 * Probe a pid for the two facts ownership needs: does a process exist, and when
 * did it start?
 *
 * `alive: false` means the process is gone. `alive: true` with a `startTime`
 * of `null` means the process is there but its start time could not be read, so
 * the caller cannot tell the owner from a pid-reusing stranger and must fall
 * back to the heartbeat lease.
 */
export const probeProcess = (
  pid,
  { isAlive = isProcessAlive, readStartTime = readProcessStartTime } = {},
) => {
  if (!isAlive(pid)) return { alive: false, startTime: null };

  const startTime = readStartTime(pid);

  // A non-positive or non-finite reading is "unreadable", not a start time in
  // 1970: treating 0 as readable would make every later-started process look
  // like the marker's owner.
  return { alive: true, startTime: Number.isFinite(startTime) && startTime > 0 ? startTime : null };
};

/**
 * True only when no live build can still own the backup, so recovery and the
 * sweep may move or delete it.
 *
 * Ownership is decided by the process that wrote the marker. Neither signal
 * alone is enough:
 *
 * - a pid is reused, so "a process with this pid exists" cannot establish
 *   ownership (the previous finding);
 * - a heartbeat stops when its writer stalls, so "the heartbeat is stale"
 *   cannot establish death either (this finding). A live build stuck on a
 *   locked file past the lease must keep the tree it needs for rollback.
 *
 * So the two are combined with the owner's process START TIME: a process is the
 * owner exactly when a process with the marker's pid exists AND its start time
 * is not later than the marker's `startedAt`. A LATER start time means the pid
 * was reused by an unrelated process, so the writer is gone.
 *
 * - no marker, or no readable heartbeat -> abandoned
 * - heartbeat within the lease -> owned, unless the pid is proven gone (the
 *   owner crashed just now, so recover early instead of waiting out the lease)
 * - heartbeat past the lease, owner start time readable:
 *     - process gone -> abandoned
 *     - start time <= `startedAt` -> the same build is alive but stalled; owned
 *     - start time >  `startedAt` -> the pid was reused -> abandoned
 * - heartbeat past the lease, owner start time UNREADABLE (unsupported platform
 *   or permission failure) -> abandoned. `probeOwner` reports
 *   `{ alive: true, startTime: null }` there; nothing else can distinguish a
 *   stalled owner from a reused pid, so the elapsed lease is the signal that
 *   wins.
 */
export const isAbandonedBackup = (
  marker,
  { now, markerLeaseMs, probeOwner = probeProcess },
) => {
  if (marker === null) return true;
  if (!Number.isFinite(marker.heartbeatAt)) return true;

  const owner = marker.pid === null ? null : probeOwner(marker.pid);

  if (now() - marker.heartbeatAt <= markerLeaseMs) {
    // The heartbeat wins: the owner beat within the lease. The pid probe only
    // narrows it further, recovering a just-crashed owner before the lease.
    return owner !== null && owner.alive === false;
  }

  // The heartbeat lost (a stalled or dead owner). The start time decides.
  if (owner === null) return true; // no pid recorded -> abandoned
  if (owner.alive === false) return true; // the owner is gone -> abandoned
  if (!Number.isFinite(marker.startedAt)) return true; // cannot compare -> lease wins
  if (!(owner.startTime > 0)) return true; // start time unreadable -> lease wins

  return owner.startTime > marker.startedAt;
};

/**
 * Every ABANDONED `<destinationDir>.previous-*` sibling, newest first. A clean
 * run removes its own backup, so anything found here is litter from an
 * interrupted or crashed run; callers take the first entry as the most recent
 * runtime to recover. A backup whose marker is still owned (fresh, or a live
 * owner whose start time matches the marker) is skipped entirely, so it can be
 * neither restored nor swept.
 */
const findAbandonedRuntimeBackups = ({
  destinationDir,
  exists,
  readdir,
  readMarker,
  now,
  markerLeaseMs,
  probeOwner,
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
      isAbandonedBackup(readMarker(path.join(parentDir, backup.name)), {
        now,
        markerLeaseMs,
        probeOwner,
      }),
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
 * owner is still recognised by its pid's start time until the lease expires.
 * Only the first failure in a run warns, so a persistently failing refresh
 * stays visible without warning on every beat.
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
 * Recovery and the sweep only ever touch an ABANDONED backup
 * (`isAbandonedBackup`): two builds can overlap, and one must not steal or
 * delete the runtime the other has renamed aside mid-publish. A backup whose
 * marker is fresh, or whose recorded owner is still the live process that wrote
 * it (pid present with a matching start time), is left exactly where it is —
 * even when that owner has stalled past the heartbeat lease.
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
  probeOwner = probeProcess,
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
    probeOwner,
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
  probeOwner = probeProcess,
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
        probeOwner,
        readMarker,
        writeMarker,
        markerLeaseMs,
      });
    }
  } finally {
    remove(stagingDir, { recursive: true, force: true });
  }
};
