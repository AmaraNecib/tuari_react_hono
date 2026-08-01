import "dotenv/config";

import { resolveDatabaseEnv } from "./database-env";
import { isLocalHostname, normalizeBaseUrl, normalizeOriginList } from "./url";

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

const requireEnv = (
  source: NodeJS.ProcessEnv,
  key: "BETTER_AUTH_SECRET",
) => {
  const value = source[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
};

const resolveBootstrapSetupKey = (source: NodeJS.ProcessEnv) => {
  const value = source.BOOTSTRAP_SETUP_KEY?.trim() || null;

  if ((source.NODE_ENV ?? "development") === "production" && !value) {
    throw new Error("BOOTSTRAP_SETUP_KEY is required in production");
  }

  return value;
};

const toPort = (value: string | undefined) => {
  if (value === undefined) {
    return defaultPort;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`API_PORT must be a positive integer, received "${value}"`);
  }

  return port;
};

const toBoolean = (value: string | undefined) => {
  if (value === undefined) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

export const createEnv = (source: NodeJS.ProcessEnv = process.env) => {
  const database = resolveDatabaseEnv(source);
  const allowedOrigins =
    source.ALLOWED_ORIGINS !== undefined
      ? normalizeOriginList(splitCsv(source.ALLOWED_ORIGINS))
      : normalizeOriginList(defaultAllowedOrigins);

  return {
    host: source.API_HOST ?? defaultHost,
    port: toPort(source.API_PORT),
    allowedOrigins,
    trustProxyHeaders: toBoolean(source.API_TRUST_PROXY_HEADERS),
    ...database,
    betterAuthSecret: requireEnv(source, "BETTER_AUTH_SECRET"),
    betterAuthUrl: normalizeBaseUrl(
      source.BETTER_AUTH_URL?.trim() ||
      `${isLocalHostname(source.API_HOST ?? defaultHost) ? "http" : "https"}://${source.API_HOST ?? defaultHost}:${toPort(source.API_PORT)}`,
    ),
    bootstrapSetupKey: resolveBootstrapSetupKey(source),
  } as const;
};
