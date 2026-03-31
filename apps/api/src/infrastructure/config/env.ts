import "dotenv/config";

import { resolveDatabaseEnv } from "./database-env";

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

export const normalizeOrigin = (value: string) => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Origin value cannot be empty");
  }

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

const normalizeOriginList = (values: readonly string[]) => [...new Set(values.map(normalizeOrigin))];

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]" || hostname === "::1" || hostname === "tauri.localhost";

const normalizeBaseUrl = (value: string) => {
  const trimmedValue = value.trim();

  let parsed: URL;

  try {
    parsed = new URL(trimmedValue);
  } catch {
    throw new Error(`Invalid BETTER_AUTH_URL: ${value}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`BETTER_AUTH_URL must use http or https, received "${parsed.protocol}"`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("BETTER_AUTH_URL must not include credentials, query parameters, or fragments");
  }

  if (!isLocalHostname(parsed.hostname) && parsed.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use https for non-local hosts");
  }

  return parsed.toString().replace(/\/+$/, "");
};

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
    ...database,
    betterAuthSecret: requireEnv(source, "BETTER_AUTH_SECRET"),
    betterAuthUrl: normalizeBaseUrl(
      source.BETTER_AUTH_URL ??
      `http://${source.API_HOST ?? defaultHost}:${toPort(source.API_PORT)}`,
    ),
    bootstrapSetupKey: resolveBootstrapSetupKey(source),
  } as const;
};
