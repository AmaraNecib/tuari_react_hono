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
import { accessSync, constants, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type BackupsRootValidation =
  | { success: true; path: string }
  | { success: false; error: string };

const reasonFor = (error: unknown): string =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);

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
    accessSync(path, constants.W_OK);
    return { success: true, path };
  } catch (error) {
    return {
      success: false,
      error: `cannot use this folder: ${reasonFor(error)}`,
    };
  }
}
