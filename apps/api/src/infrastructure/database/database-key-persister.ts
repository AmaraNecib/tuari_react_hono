import type { DatabaseKeyChangeResult } from "./database-key-manager";
import { updateConfigFile } from "../config/config-file-writer";

/**
 * Persists a newly rotated database encryption key so a process restart can
 * still open the database (issue #265).
 *
 * Before #265, `changeDbEncryptionKey` rekeyed the database but nothing
 * stored the new key — the next startup decrypted with the stale key and
 * failed with `file is not a database`. The rekey flow MUST persist the new
 * key through this port.
 */
export interface DatabaseKeyPersister {
  /**
   * Persist the new key to durable storage.
   *
   * @param newKey - The key the database was just re-encrypted with.
   * @returns `{ success: true }` when the key is durable, or a discriminated
   *          failure with an honest reason. Never throws.
   */
  persistKey(newKey: string): DatabaseKeyChangeResult;
}

/**
 * Create a {@link DatabaseKeyPersister} that writes the key into the
 * user-editable config file (`TUARI_CONFIG_FILE`), under a `db_key` field,
 * preserving all other fields. The write is atomic (temp file + rename).
 *
 * When `configFilePath` is null (no config file configured), persistence is
 * skipped and `{ success: true }` is returned — the caller (the desktop host,
 * which pins the key via its own secret store) is responsible for persisting
 * the key. The port contract is documented on {@link DatabaseKeyPersister}.
 */
export function createConfigFileKeyPersister(
  configFilePath: string | null,
): DatabaseKeyPersister {
  return {
    persistKey(newKey: string): DatabaseKeyChangeResult {
      if (!configFilePath) {
        return { success: true };
      }

      const result = updateConfigFile(configFilePath, (config) => {
        config.db_key = newKey;
      });

      return result.success
        ? { success: true }
        : {
            success: false,
            error: "Failed to persist database encryption key",
          };
    },
  };
}
