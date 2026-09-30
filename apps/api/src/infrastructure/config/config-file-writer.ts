/**
 * Atomic read-modify-write for the user-editable config file.
 *
 * Both the DB-key persister (#265) and the backup-folder persister (#436)
 * update one field while preserving every other field, and both need the same
 * crash-safety guarantees. This is the single place that knows the file's
 * shape, its atomic-write protocol, and its restrictive mode.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";

import { configFileSchema } from "../../config/loader";

/**
 * Restrictive mode for the replacement file: owner read/write only. The config
 * file may carry the DB encryption key, so a permissive umask must never leave
 * it readable by other local users.
 */
const CONFIG_FILE_MODE = 0o600;

export type ConfigFileWriteResult =
  | { success: true }
  | { success: false };

/**
 * Read the config file, apply `mutate`, and atomically replace it.
 *
 * A missing file is treated as an empty object (the first write creates it).
 * The merged document must still satisfy {@link configFileSchema} — writing a
 * config the loader would reject is an honest failure, never a silent wipe of
 * the user's settings. Never throws.
 */
export function updateConfigFile(
  configFilePath: string,
  mutate: (config: Record<string, unknown>) => void,
): ConfigFileWriteResult {
  try {
    // Read-modify-write: preserve every existing field. An unreadable/invalid
    // file — or a non-object document (e.g. a bare array) whose fields cannot
    // be preserved — is an honest failure.
    let config: Record<string, unknown> = {};
    if (existsSync(configFilePath)) {
      const parsed: unknown = JSON.parse(readFileSync(configFilePath, "utf8"));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("config file is not a JSON object");
      }
      config = parsed as Record<string, unknown>;
    }

    mutate(config);

    if (!configFileSchema.safeParse(config).success) {
      throw new Error("merged config would be rejected by the loader");
    }

    // Atomic + durable write: a unique temp file is written (with fsync so the
    // bytes reach disk), then renamed over the target — a crash can never
    // leave a partially-written config file behind, and a concurrent writer
    // cannot collide on the temp name. The explicit restrictive mode survives
    // the rename over the target.
    const tmpPath = `${configFilePath}.${process.pid}.tmp`;
    const fd = openSync(tmpPath, "w", CONFIG_FILE_MODE);
    try {
      writeSync(fd, JSON.stringify(config, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, configFilePath);

    return { success: true };
  } catch {
    // Best-effort cleanup: a failed write/rename must not leave a stale temp
    // file behind.
    try {
      unlinkSync(`${configFilePath}.${process.pid}.tmp`);
    } catch {
      // Ignore — the temp may not exist; the honest failure is what matters.
    }
    return { success: false };
  }
}
