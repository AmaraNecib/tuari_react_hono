import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfigFile, mergeConfigIntoEnv } from "./loader";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "tuari-config-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const writeConfig = (content: unknown, name = "config.json") => {
  const path = join(tempDir, name);
  writeFileSync(path, JSON.stringify(content), "utf8");
  return path;
};

describe("loadConfigFile", () => {
  it("returns null when TUARI_CONFIG_FILE is not set", () => {
    expect(loadConfigFile({})).toBeNull();
  });

  it("returns null when the file does not exist", () => {
    expect(loadConfigFile({ TUARI_CONFIG_FILE: join(tempDir, "missing.json") })).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const path = join(tempDir, "config.json");
    writeFileSync(path, "not json{", "utf8");
    expect(loadConfigFile({ TUARI_CONFIG_FILE: path })).toBeNull();
  });

  it("returns null for invalid schema (e.g. unknown adapter)", () => {
    const path = writeConfig({ db_adapter: "postgres" });
    expect(loadConfigFile({ TUARI_CONFIG_FILE: path })).toBeNull();
  });

  it("loads a valid config file", () => {
    const path = writeConfig({ db_adapter: "inmemory", db_path: "data/custom.sqlite" });
    const file = loadConfigFile({ TUARI_CONFIG_FILE: path });
    expect(file).toEqual({ db_adapter: "inmemory", db_path: "data/custom.sqlite" });
  });
});

describe("mergeConfigIntoEnv", () => {
  it("returns source unchanged when file is null", () => {
    const source = { BETTER_AUTH_SECRET: "s" };
    expect(mergeConfigIntoEnv(null, source)).toBe(source);
  });

  it("merges db_adapter and db_path when env vars are absent", () => {
    const merged = mergeConfigIntoEnv({ db_adapter: "inmemory", db_path: "data/custom.sqlite" }, {});
    expect(merged.DB_ADAPTER).toBe("inmemory");
    expect(merged.APP_DB_PATH).toBe("data/custom.sqlite");
  });

  it("env vars win over the config file", () => {
    const merged = mergeConfigIntoEnv(
      { db_adapter: "inmemory", db_path: "config-path.sqlite" },
      { DB_ADAPTER: "sqlite", APP_DB_PATH: "env-path.sqlite" },
    );
    expect(merged.DB_ADAPTER).toBe("sqlite");
    expect(merged.APP_DB_PATH).toBe("env-path.sqlite");
  });

  it("keeps DATABASE_URL precedence over db_path", () => {
    const merged = mergeConfigIntoEnv(
      { db_path: "config-path.sqlite" },
      { DATABASE_URL: "file:./env-path.sqlite" },
    );
    expect(merged.APP_DB_PATH).toBeUndefined();
    expect(merged.DATABASE_URL).toBe("file:./env-path.sqlite");
  });

  it("maps postgres fields to PG_* env vars", () => {
    const merged = mergeConfigIntoEnv(
      { pg_host: "db.local", pg_port: 5432, pg_database: "tuari", pg_user: "u", pg_password: "p", pg_ssl: true },
      {},
    );
    expect(merged.PG_HOST).toBe("db.local");
    expect(merged.PG_PORT).toBe("5432");
    expect(merged.PG_DATABASE).toBe("tuari");
    expect(merged.PG_USER).toBe("u");
    expect(merged.PG_PASSWORD).toBe("p");
    expect(merged.PG_SSL).toBe("true");
  });
});
