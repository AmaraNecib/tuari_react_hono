/**
 * Backup-folder setting validation (#436).
 *
 * The backup root is user-editable from the desktop config, so a typo or a
 * path to a file must fail LOUDLY at the point of change, with a message that
 * names the problem. Once accepted, the path is persisted and handed to the
 * service; a root that later becomes unwritable still degrades to a recorded
 * failure instead of blocking startup (see `backup.service.ts`), so this
 * validator never has to be the thing that keeps the app alive.
 */
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

export type BackupsRootValidation =
  | { success: true; path: string }
  | { success: false; error: string };

const reasonFor = (error: unknown): string =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);

/** Name prefix of the throwaway directory the probe creates and removes. */
const PROBE_DIRECTORY_PREFIX = ".tuari-probe-";

/**
 * Prove the folder supports the directory operations a backup actually needs:
 * create a staging directory, write a file into it, rename it into place, and
 * remove it.
 *
 * A bare file write (or `accessSync(W_OK)`) is not enough: a folder can allow
 * file creation yet deny renaming or directory deletion, so the save would
 * report success, leak a probe on every attempt, and the 3am run would still
 * fail at rename/prune. The final removal is intentionally left to throw — the
 * caller reports its error, which is the finding.
 */
const probeBackupFolderOperations = (path: string): void => {
  const staging = mkdtempSync(join(path, PROBE_DIRECTORY_PREFIX));
  const renamed = `${staging}-ready`;
  try {
    writeFileSync(join(staging, "probe"), "");
    renameSync(staging, renamed);
  } catch (error) {
    // Best-effort cleanup of whichever name currently holds the probe. The
    // original failure is the finding, so a cleanup error must not replace it.
    rmSync(staging, { recursive: true, force: true });
    rmSync(renamed, { recursive: true, force: true });
    throw error;
  }
  // `force` ignores a missing path but still throws on a permission error, so
  // a folder that denies deletion fails validation here (and does not leak).
  rmSync(renamed, { recursive: true, force: true });
};

/**
 * Normalize and validate a chosen backups root.
 *
 * Accepts a relative path (resolved against the process CWD, matching how the
 * config resolver reads it), creates the directory when it does not exist, and
 * requires it to be a writable directory. Returns an absolute path on success
 * so the persisted value and the status agree.
 */
export function validateBackupsRootPath(
  rawPath: string,
): BackupsRootValidation {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "backup folder path is required" };
  }

  const path = resolve(trimmed);

  try {
    const existing = statSync(path, { throwIfNoEntry: false });
    if (existing !== undefined && !existing.isDirectory()) {
      return {
        success: false,
        error: `the path is a file, not a folder: ${path}`,
      };
    }
    if (existing === undefined) {
      mkdirSync(path, { recursive: true });
    }
    // Prove the folder can host a real backup, not just be stat'd. This runs
    // the same create/write/rename/remove sequence the engine does, so a folder
    // that allows file creation but denies rename or deletion is rejected here
    // instead of at 3am.
    probeBackupFolderOperations(path);
    return { success: true, path };
  } catch (error) {
    return {
      success: false,
      error: `cannot use this folder: ${reasonFor(error)}`,
    };
  }
}
