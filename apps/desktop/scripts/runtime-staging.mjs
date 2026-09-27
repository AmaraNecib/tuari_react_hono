import { existsSync, renameSync, rmSync } from "node:fs";

/**
 * Move a fully built runtime tree into place, preserving the previous tree if
 * anything goes wrong.
 *
 * The previous directory is renamed aside before the staged one lands, so a
 * failure during the swap restores it instead of leaving a half-copied tree.
 * The staged directory must share a volume with the destination for the rename
 * to be atomic; `build-sidecar.mjs` stages under `src-tauri/` for that reason.
 */
export const swapRuntimeDirectory = ({
  stagingDir,
  destinationDir,
  rename = renameSync,
  remove = rmSync,
  exists = existsSync,
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

  if (hadDestination) {
    remove(backupDir, { recursive: true, force: true });
  }
};

/**
 * Build a replacement runtime in `stagingDir`, prove it works with `probe`, and
 * only then publish it. `publish: false` (the ephemeral typecheck path) probes
 * and discards.
 *
 * The build and probe run BEFORE the swap, and the staging tree is removed on
 * every path, so a failed build or probe leaves the existing runtime
 * byte-for-byte intact rather than deleting it first (#409).
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
}) => {
  try {
    build();
    probe();

    if (publish) {
      swapRuntimeDirectory({ stagingDir, destinationDir, rename, remove, exists });
    }
  } finally {
    remove(stagingDir, { recursive: true, force: true });
  }
};
