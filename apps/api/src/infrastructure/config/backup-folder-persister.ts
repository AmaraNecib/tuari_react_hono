/**
 * Persists the chosen backup root into the user-editable config file (#436).
 *
 * The desktop shell points the sidecar at `<tuari>/config.json` via
 * `TUARI_CONFIG_FILE`; the API reads that same file at startup
 * (`loadConfigFile` → `configFileSchema` → `mergeConfigIntoEnv`), so writing
 * `backups_root` here is how the choice reaches the next sidecar run — without
 * adding another environment variable to the shell's allowlist.
 */
import { updateConfigFile } from "./config-file-writer";

export type BackupFolderPersistResult =
  | {
      success: true;
      /** False when there is no config file to write: session-only choice. */
      persisted: boolean;
    }
  | { success: false; error: string };

export interface BackupFolderPersister {
  /**
   * Persist `path` as `backups_root`, preserving every other config field.
   * Never throws.
   */
  persistBackupsRoot(path: string): BackupFolderPersistResult;
}

/**
 * Create a persister over the given config file.
 *
 * When `configFilePath` is null there is no durable config to update, so the
 * result is `{ success: true, persisted: false }` — the caller applies the
 * root for this session and the UI states that it will not survive a restart.
 */
export function createConfigFileBackupFolderPersister(
  configFilePath: string | null,
): BackupFolderPersister {
  return {
    persistBackupsRoot(path: string): BackupFolderPersistResult {
      if (!configFilePath) {
        return { success: true, persisted: false };
      }

      const result = updateConfigFile(configFilePath, (config) => {
        config.backups_root = path;
      });

      return result.success
        ? { success: true, persisted: true }
        : { success: false, error: "Failed to persist the backup folder" };
    },
  };
}
