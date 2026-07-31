/**
 * Config file loader.
 *
 * Reads a user-editable `config.json` (e.g. `%APPDATA%/Tuari/config.json`
 * or any path passed via `TUARI_CONFIG_FILE`) and merges it with
 * environment variables. Environment variables always win over the
 * config file, so CI / terminal overrides keep working.
 *
 * Phase 5 of the ports-and-adapters work: gives desktop users a way to
 * switch the database adapter and connection details without recompiling.
 */

import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { dbAdapterSchema } from "./db-adapter";

/** Shape of the user-editable config.json. */
export const configFileSchema = z.object({
  /** Database adapter: sqlite (default) or inmemory. */
  db_adapter: dbAdapterSchema.optional(),
  /** SQLite database file path (maps to APP_DB_PATH). */
  db_path: z.string().optional(),
  // Postgres fields are accepted for forward compatibility (adapter not yet shipped).
  pg_host: z.string().optional(),
  pg_port: z.number().int().positive().max(65535).optional(),
  pg_database: z.string().optional(),
  pg_user: z.string().optional(),
  pg_password: z.string().optional(),
  pg_ssl: z.boolean().optional(),
});

export type ConfigFileShape = z.infer<typeof configFileSchema>;

/**
 * Load and validate the config file for a given env source.
 *
 * The file is only consulted when `TUARI_CONFIG_FILE` is set in the
 * source (the desktop sidecar sets it explicitly). Without it, this
 * returns null so tests and standalone dev runs stay isolated.
 *
 * @param source - Env source (defaults to process.env).
 * @returns Validated config file contents, or null if unset/missing/invalid.
 */
export function loadConfigFile(
  source: NodeJS.ProcessEnv = process.env,
): ConfigFileShape | null {
  const configPath = source.TUARI_CONFIG_FILE?.trim();

  // Only read the file when an explicit path is provided.
  if (!configPath) return null;
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = configFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(
        `[config] Ignoring invalid config file ${configPath}: ${parsed.error.issues
          .map((i) => i.path.join("."))
          .join(", ")}`,
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.warn(`[config] Ignoring unreadable config file ${configPath}`, error);
    return null;
  }
}

/**
 * Merge config-file values into an env source. Environment variables win.
 */
export function mergeConfigIntoEnv(
  file: ConfigFileShape | null,
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (!file) return source;

  const merged: NodeJS.ProcessEnv = { ...source };

  if (file.db_adapter !== undefined && merged.DB_ADAPTER === undefined) {
    merged.DB_ADAPTER = file.db_adapter;
  }
  if (
    file.db_path !== undefined &&
    merged.APP_DB_PATH === undefined &&
    merged.DATABASE_URL === undefined
  ) {
    merged.APP_DB_PATH = file.db_path;
  }
  if (file.pg_host !== undefined && merged.PG_HOST === undefined) {
    merged.PG_HOST = file.pg_host;
  }
  if (file.pg_port !== undefined && merged.PG_PORT === undefined) {
    merged.PG_PORT = String(file.pg_port);
  }
  if (file.pg_database !== undefined && merged.PG_DATABASE === undefined) {
    merged.PG_DATABASE = file.pg_database;
  }
  if (file.pg_user !== undefined && merged.PG_USER === undefined) {
    merged.PG_USER = file.pg_user;
  }
  if (file.pg_password !== undefined && merged.PG_PASSWORD === undefined) {
    merged.PG_PASSWORD = file.pg_password;
  }
  if (file.pg_ssl !== undefined && merged.PG_SSL === undefined) {
    merged.PG_SSL = file.pg_ssl ? "true" : "false";
  }

  return merged;
}
