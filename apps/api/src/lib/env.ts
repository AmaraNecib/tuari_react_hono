import "dotenv/config";
import { resolve } from "node:path";

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const defaultPort = 4318;
const defaultHost = "127.0.0.1";
const defaultDbPath = resolve(process.cwd(), "data", "tuari.sqlite");
const toSqliteUrl = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, "/");

  return `file:${normalized}`;
};
const defaultAllowedOrigins = [
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

export const env = {
  host: process.env.API_HOST ?? defaultHost,
  port: Number(process.env.API_PORT ?? defaultPort),
  appClientKey:
    process.env.APP_CLIENT_KEY ?? "tuari-desktop-client-key-v1",
  allowedOrigins:
    process.env.ALLOWED_ORIGINS !== undefined
      ? splitCsv(process.env.ALLOWED_ORIGINS)
      : defaultAllowedOrigins,
  authDbPath: process.env.AUTH_DB_PATH ?? process.env.APP_DB_PATH ?? defaultDbPath,
  appDbPath: process.env.APP_DB_PATH ?? process.env.AUTH_DB_PATH ?? defaultDbPath,
  databaseUrl: process.env.DATABASE_URL ?? toSqliteUrl(process.env.APP_DB_PATH ?? process.env.AUTH_DB_PATH ?? defaultDbPath),
  betterAuthSecret:
    process.env.BETTER_AUTH_SECRET ??
    "dev-only-secret-dev-only-secret-dev-only-secret",
  betterAuthUrl:
    process.env.BETTER_AUTH_URL ??
    `http://${process.env.API_HOST ?? defaultHost}:${
      process.env.API_PORT ?? defaultPort
    }`,
} as const;
