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

const requireEnv = (
  source: NodeJS.ProcessEnv,
  key: "APP_CLIENT_KEY" | "BETTER_AUTH_SECRET",
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

  return {
    host: source.API_HOST ?? defaultHost,
    port: toPort(source.API_PORT),
    appClientKey: requireEnv(source, "APP_CLIENT_KEY"),
    allowedOrigins:
      source.ALLOWED_ORIGINS !== undefined
        ? splitCsv(source.ALLOWED_ORIGINS)
        : defaultAllowedOrigins,
    ...database,
    betterAuthSecret: requireEnv(source, "BETTER_AUTH_SECRET"),
    betterAuthUrl:
      source.BETTER_AUTH_URL ??
      `http://${source.API_HOST ?? defaultHost}:${toPort(source.API_PORT)}`,
    bootstrapSetupKey: resolveBootstrapSetupKey(source),
  } as const;
};
