/**
 * Application configuration module.
 *
 * Reads environment variables (and, in future phases, a config.json file
 * from the app data directory) and exports a typed, Zod-validated config
 * object. This is the single source of truth for all runtime configuration.
 *
 * Phase 1: env-only reading with Zod validation.
 * Phase 5 (future): merge env vars + config.json.
 */

import "dotenv/config";
import { z } from "zod";
import { resolveDatabaseEnv } from "../infrastructure/config/database-env";
import { normalizeBaseUrl, normalizeOriginList, isLocalHostname } from "../infrastructure/config/url";
import { loadConfigFile, mergeConfigIntoEnv } from "./loader";
import { dbAdapterSchema } from "./db-adapter";
import {
  BETTER_AUTH_SECRET_MIN_LENGTH,
  BOOTSTRAP_SETUP_KEY_MIN_LENGTH,
  isStrongSecret,
} from "./secret-strength";
export { dbAdapterSchema } from "./db-adapter";
export {
  BETTER_AUTH_SECRET_MIN_LENGTH,
  BOOTSTRAP_SETUP_KEY_MIN_LENGTH,
  estimateSecretEntropyBits,
  isStrongSecret,
  safeSecretEquals,
} from "./secret-strength";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const defaultPort = 4318;
const defaultHost = "127.0.0.1";
const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

// ---------------------------------------------------------------------------
// Zod schema for the full application config
// ---------------------------------------------------------------------------

export const appConfigSchema = z.object({
  // --- Database ---
  /** Database adapter type. "sqlite" is currently the only supported value. */
  dbAdapter: dbAdapterSchema.default("sqlite"),
  /** Absolute or relative path to the SQLite database file. */
  databasePath: z.string(),
  /** SQLite file URL (file:///path/to/db.sqlite). */
  databaseUrl: z.string().startsWith("file:"),
  /** Root directory for file attachments (invoices, etc.). */
  attachmentsRootPath: z.string(),

  // --- Server ---
  /** Bind host for the HTTP server. */
  host: z.string().default(defaultHost),
  /** TCP port for the HTTP server (1..65535). */
  port: z.coerce.number().int().positive().max(65535).default(defaultPort),
  /** Allowed CORS origins. */
  allowedOrigins: z
    .array(z.string())
    .default(normalizeOriginList(defaultAllowedOrigins)),
  /** Trust X-Forwarded-* headers from proxies. */
  trustProxyHeaders: z.boolean().default(false),

  // --- Auth ---
  /**
   * Better Auth secret key (required). Must be ≥ 32 characters with
   * sufficient estimated entropy — a guessable placeholder is rejected.
   */
  betterAuthSecret: z
    .string()
    .min(
      BETTER_AUTH_SECRET_MIN_LENGTH,
      `BETTER_AUTH_SECRET must be at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters`,
    )
    .refine(
      (value) => isStrongSecret(value, BETTER_AUTH_SECRET_MIN_LENGTH),
      "BETTER_AUTH_SECRET must have sufficient entropy (random-looking, not a placeholder)",
    ),
  /**
   * Public base URL for the auth server.
   * Validated and normalized by the schema itself (no manual pre-validation):
   * must be a valid http(s) URL without credentials, query, or fragments,
   * and https for non-local hosts. Trailing slashes are trimmed.
   */
  betterAuthUrl: z.string().transform((value, ctx) => {
    try {
      return normalizeBaseUrl(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error),
      });
      return z.NEVER;
    }
  }),
  /** Bootstrap setup key for initial admin creation (required in production). */
  bootstrapSetupKey: z.string().nullable().default(null),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

/**
 * Create a typed, validated AppConfig from environment variables and
 * (optionally) a config file.
 *
 * When `TUARI_CONFIG_FILE` is set, its contents are merged into the
 * env source first (env vars always win). Without it, this is pure
 * env-based reading.
 *
 * @param source - Environment variable source (defaults to `process.env`).
 * @throws {z.ZodError} If validation fails.
 */
export function createAppConfig(
  source: NodeJS.ProcessEnv = process.env,
): AppConfig {
  // Merge config.json (when TUARI_CONFIG_FILE is set) — env wins.
  const configFile = loadConfigFile(source);
  const effectiveSource = mergeConfigIntoEnv(configFile, source);

  // --- Database resolution (reuses the existing, tested helper) ---
  const database = resolveDatabaseEnv(effectiveSource);

  // --- Adapter selection ---
  const dbAdapter = (() => {
    const raw = effectiveSource.DB_ADAPTER?.trim().toLowerCase() || "sqlite";
    const parsed = dbAdapterSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `DB_ADAPTER must be one of: ${dbAdapterSchema.options.join(", ")}, received "${raw}"`,
      );
    }
    return parsed.data;
  })();

  // --- Server ---
  const host = effectiveSource.API_HOST?.trim() || defaultHost;

  const port = (() => {
    if (effectiveSource.API_PORT === undefined) return defaultPort;
    const p = Number(effectiveSource.API_PORT);
    if (!Number.isInteger(p) || p <= 0 || p > 65535) {
      throw new Error(
        `API_PORT must be a positive integer between 1 and 65535, received "${effectiveSource.API_PORT}"`,
      );
    }
    return p;
  })();

  const allowedOrigins =
    effectiveSource.ALLOWED_ORIGINS !== undefined
      ? normalizeOriginList(splitCsv(effectiveSource.ALLOWED_ORIGINS))
      : normalizeOriginList(defaultAllowedOrigins);

  const trustProxyHeaders = (() => {
    if (effectiveSource.API_TRUST_PROXY_HEADERS === undefined) return false;
    return ["1", "true", "yes", "on"].includes(
      effectiveSource.API_TRUST_PROXY_HEADERS.trim().toLowerCase(),
    );
  })();

  // --- Auth ---
  const betterAuthSecret = (() => {
    const value = effectiveSource.BETTER_AUTH_SECRET?.trim();
    if (!value) throw new Error("BETTER_AUTH_SECRET is required");
    return value;
  })();

  const betterAuthUrl =
    effectiveSource.BETTER_AUTH_URL?.trim() ||
    `${isLocalHostname(host) ? "http" : "https"}://${host}:${port}`;

  const bootstrapSetupKey = (() => {
    const value = effectiveSource.BOOTSTRAP_SETUP_KEY?.trim() || null;
    if ((effectiveSource.NODE_ENV ?? "development") === "production") {
      if (!value) {
        throw new Error("BOOTSTRAP_SETUP_KEY is required in production");
      }
      if (!isStrongSecret(value, BOOTSTRAP_SETUP_KEY_MIN_LENGTH)) {
        throw new Error(
          `BOOTSTRAP_SETUP_KEY must be at least ${BOOTSTRAP_SETUP_KEY_MIN_LENGTH} characters with sufficient entropy in production`,
        );
      }
    }
    return value;
  })();

  // --- Assemble and validate with Zod ---
  const raw: AppConfig = {
    dbAdapter,
    databasePath: database.databasePath,
    databaseUrl: database.databaseUrl,
    attachmentsRootPath: database.attachmentsRootPath,
    host,
    port,
    allowedOrigins,
    trustProxyHeaders,
    betterAuthSecret,
    betterAuthUrl,
    bootstrapSetupKey,
  };

  return appConfigSchema.parse(raw);
}
