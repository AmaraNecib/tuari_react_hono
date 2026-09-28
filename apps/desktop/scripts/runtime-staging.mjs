import { existsSync, renameSync, rmSync } from "node:fs";

/**
 * Move a fully built runtime tree into place, preserving the previous tree if
 * anything goes wrong.
 *
 * The previous directory is renamed aside before the staged one lands, so a
 * failure during the swap restores it instead of leaving a half-copied tree.
 * The staged directory must share a volume with the destination for the rename
 * to be atomic; `build-sidecar.mjs` stages under `src-tauri/` for that reason.
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
  warn = console.warn,
}) => {
  const backupDir = `${destinationDir}.previous-${process.pid}`;
  const hadDestination = exists(destinationDir);

  if (hadDestination) {
    // Clear a backup left behind by a crashed run before reusing the name.
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

  try {
    remove(backupDir, { recursive: true, force: true });
  } catch (error) {
    warn(
      [
        "Published the staged runtime, but the previous runtime could not be removed.",
        `  published (live now): ${destinationDir}`,
        `  leftover (inactive):  ${backupDir}`,
        `  cause:                ${error instanceof Error ? error.message : String(error)}`,
        "The runtime WAS replaced; this is cleanup-only, so the build is not failed.",
        "Delete the leftover directory once nothing holds it open.",
      ].join("\n"),
    );
  }
};

/**
 * Build a replacement runtime in `stagingDir`, prove it works with `probe`, and
 * only then publish it. `publish: false` (the ephemeral typecheck path) probes
 * and discards.
 *
 * The build and probe run BEFORE the swap, and the staging tree is removed on
 * every path, so a failed build or probe leaves the existing runtime
 * byte-for-byte intact rather than deleting it first (#409). Once the swap has
 * published the staged tree, a failure to remove the renamed-aside previous
 * tree is warned about instead of thrown (see `swapRuntimeDirectory`): the new
 * runtime is live either way, and a failure exit there would misreport that.
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
  warn = console.warn,
}) => {
  try {
    build();
    probe();

    if (publish) {
      swapRuntimeDirectory({ stagingDir, destinationDir, rename, remove, exists, warn });
    }
  } finally {
    remove(stagingDir, { recursive: true, force: true });
  }
};
