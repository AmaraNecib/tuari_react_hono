import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import type { DatabaseKeyChangeResult } from "./database-key-manager";

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

      try {
        // Read-modify-write: preserve every existing field, add/refresh
        // `db_key`. An unreadable/invalid file — or a non-object document
        // (e.g. a bare array) whose fields cannot be preserved — is an honest
        // failure, never a silent content wipe.
        let config: Record<string, unknown> = {};
        if (existsSync(configFilePath)) {
          const parsed: unknown = JSON.parse(readFileSync(configFilePath, "utf8"));
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("config file is not a JSON object");
          }
          config = parsed as Record<string, unknown>;
        }
        config.db_key = newKey;

        // Atomic + durable write: a unique temp file is written (with fsync
        // so the bytes reach disk), then renamed over the target — a crash
        // can never leave a partially-written config file behind, and a
        // concurrent writer cannot collide on the temp name.
        const tmpPath = `${configFilePath}.${process.pid}.tmp`;
        const fd = openSync(tmpPath, "w");
        try {
          writeSync(fd, JSON.stringify(config, null, 2));
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        renameSync(tmpPath, configFilePath);

        return { success: true };
      } catch {
        return {
          success: false,
          error: "Failed to persist database encryption key",
        };
      }
    },
  };
}
