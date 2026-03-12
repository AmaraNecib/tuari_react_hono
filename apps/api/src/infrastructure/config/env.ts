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
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

const toPort = (value: string | undefined) => {
  if (value === undefined) {
    return defaultPort;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`API_PORT must be a positive integer, received \"${value}\"`);
  }

  return port;
};

export const createEnv = (source: NodeJS.ProcessEnv = process.env) => {
  const database = resolveDatabaseEnv(source);

  return {
    host: source.API_HOST ?? defaultHost,
    port: toPort(source.API_PORT),
    appClientKey: source.APP_CLIENT_KEY ?? "tuari-desktop-client-key-v1",
    allowedOrigins:
      source.ALLOWED_ORIGINS !== undefined
        ? splitCsv(source.ALLOWED_ORIGINS)
        : defaultAllowedOrigins,
    ...database,
    betterAuthSecret:
      source.BETTER_AUTH_SECRET ??
      "dev-only-secret-dev-only-secret-dev-only-secret",
    betterAuthUrl:
      source.BETTER_AUTH_URL ??
      `http://${source.API_HOST ?? defaultHost}:${toPort(source.API_PORT)}`,
  } as const;
};

export const env = createEnv();
