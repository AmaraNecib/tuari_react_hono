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

const normalizeOrigin = (value: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error("Origin value cannot be empty");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid origin URL: ${value}`);
  }

  if (!parsed.protocol || !parsed.host) {
    throw new Error(`Invalid origin URL: ${value}`);
  }

  return `${parsed.protocol}//${parsed.host}`;
};

const normalizeOriginList = (values: readonly string[]) => [
  ...new Set(values.map(normalizeOrigin)),
];

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0" ||
  hostname === "[::1]" ||
  hostname === "::1" ||
  hostname === "tauri.localhost";

const normalizeBaseUrl = (value: string) => {
  const trimmedValue = value.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmedValue);
  } catch {
    throw new Error(`Invalid BETTER_AUTH_URL: ${value}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `BETTER_AUTH_URL must use http or https, received "${parsed.protocol}"`,
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "BETTER_AUTH_URL must not include credentials, query parameters, or fragments",
    );
  }

  if (!isLocalHostname(parsed.hostname) && parsed.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use https for non-local hosts");
  }

  return parsed.toString().replace(/\/+$/, "");
};

// ---------------------------------------------------------------------------
// Zod schema for the full application config
// ---------------------------------------------------------------------------

/** Supported database adapters: SQLite (production), InMemory (tests/CI). Postgres is future. */
export const dbAdapterSchema = z.enum(["sqlite", "inmemory"]);

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
  /** TCP port for the HTTP server. */
  port: z.coerce.number().int().positive().default(defaultPort),
  /** Allowed CORS origins. */
  allowedOrigins: z
    .array(z.string())
    .default(normalizeOriginList(defaultAllowedOrigins)),
  /** Trust X-Forwarded-* headers from proxies. */
  trustProxyHeaders: z.boolean().default(false),

  // --- Auth ---
  /** Better Auth secret key (required). */
  betterAuthSecret: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  /** Public base URL for the auth server. */
  betterAuthUrl: z.string(),
  /** Bootstrap setup key for initial admin creation (required in production). */
  bootstrapSetupKey: z.string().nullable().default(null),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

/**
 * Create a typed, validated AppConfig from environment variables.
 *
 * In Phase 1 this reads only from `process.env`. Future phases will
 * add a config file (e.g. `config.json` in the app data directory)
 * that is merged with (and overridden by) environment variables.
 *
 * @param source - Environment variable source (defaults to `process.env`).
 * @throws {z.ZodError} If validation fails.
 */
export function createAppConfig(
  source: NodeJS.ProcessEnv = process.env,
): AppConfig {
  // --- Database resolution (reuses the existing, tested helper) ---
  const database = resolveDatabaseEnv(source);

  // --- Adapter selection ---
  const dbAdapter = (() => {
    const raw = source.DB_ADAPTER?.trim().toLowerCase() || "sqlite";
    const parsed = dbAdapterSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `DB_ADAPTER must be one of: ${dbAdapterSchema.options.join(", ")}, received "${raw}"`,
      );
    }
    return parsed.data;
  })();

  // --- Server ---
  const host = source.API_HOST?.trim() || defaultHost;

  const port = (() => {
    if (source.API_PORT === undefined) return defaultPort;
    const p = Number(source.API_PORT);
    if (!Number.isInteger(p) || p <= 0 || p > 65535) {
      throw new Error(
        `API_PORT must be a positive integer between 1 and 65535, received "${source.API_PORT}"`,
      );
    }
    return p;
  })();

  const allowedOrigins =
    source.ALLOWED_ORIGINS !== undefined
      ? normalizeOriginList(splitCsv(source.ALLOWED_ORIGINS))
      : normalizeOriginList(defaultAllowedOrigins);

  const trustProxyHeaders = (() => {
    if (source.API_TRUST_PROXY_HEADERS === undefined) return false;
    return ["1", "true", "yes", "on"].includes(
      source.API_TRUST_PROXY_HEADERS.trim().toLowerCase(),
    );
  })();

  // --- Auth ---
  const betterAuthSecret = (() => {
    const value = source.BETTER_AUTH_SECRET?.trim();
    if (!value) throw new Error("BETTER_AUTH_SECRET is required");
    return value;
  })();

  const betterAuthUrl = normalizeBaseUrl(
    source.BETTER_AUTH_URL ?? `http://${host}:${port}`,
  );

  const bootstrapSetupKey = (() => {
    const value = source.BOOTSTRAP_SETUP_KEY?.trim() || null;
    if (
      (source.NODE_ENV ?? "development") === "production" &&
      !value
    ) {
      throw new Error("BOOTSTRAP_SETUP_KEY is required in production");
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
