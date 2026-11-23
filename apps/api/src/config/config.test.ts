import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appConfigSchema, createAppConfig, type AppConfig } from "./index";
import { createConfigFileBackupFolderPersister } from "../infrastructure/config/backup-folder-persister";

let configTempDir: string;
beforeEach(() => {
  configTempDir = mkdtempSync(join(tmpdir(), "tuari-appconfig-"));
});
afterEach(() => {
  rmSync(configTempDir, { recursive: true, force: true });
});

const requiredAuth = { BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM" } as const;
const productionSetupKey = "setup-key-with-entropy-9f2c1a7d";

describe("createAppConfig", () => {
  // -----------------------------------------------------------------------
  // Defaults
  // -----------------------------------------------------------------------

  it("defaults to 127.0.0.1:4318 when no server env vars are set", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4318);
  });

  it("resolves a default database path when no env override is set", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.databasePath).toMatch(/data[\\/]tuari\.sqlite$/);
    expect(config.databaseUrl).toMatch(/^file:.*data[\\/]tuari\.sqlite$/);
  });

  it("resolves attachments root next to the database path by default", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.attachmentsRootPath).toMatch(
      /data[\\/]attachments[\\/]invoices$/,
    );
  });

  it("defaults to no bootstrap setup key", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.bootstrapSetupKey).toBeNull();
  });

  it("defaults allowed origins to localhost development values", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.allowedOrigins).toContain("http://localhost:3000");
    expect(config.allowedOrigins).toContain("http://localhost:1420");
    expect(config.allowedOrigins).toContain("tauri://localhost");
  });

  // -----------------------------------------------------------------------
  // Database env overrides
  // -----------------------------------------------------------------------

  it("respects APP_DB_PATH for the database path", () => {
    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/custom.sqlite",
    });

    expect(config.databasePath).toBe("./data/custom.sqlite");
    expect(config.databaseUrl).toBe("file:./data/custom.sqlite");
  });

  it("respects APP_ATTACHMENTS_ROOT for the attachments path", () => {
    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/custom.sqlite",
      APP_ATTACHMENTS_ROOT: "./private/invoices",
    });

    expect(config.attachmentsRootPath).toMatch(/[\\/]private[\\/]invoices$/);
  });

  it("resolves the backups root as a sibling of the database directory", () => {
    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/tuari.sqlite",
    });

    // Sibling of `data`, not inside it, so a data-dir reset keeps backups.
    expect(config.backupsRootPath).toMatch(/[\\/]backups$/);
    expect(config.backupsRootPath).not.toMatch(/[\\/]data[\\/]backups$/);
  });

  it("respects APP_BACKUPS_ROOT for the backups path", () => {
    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/tuari.sqlite",
      APP_BACKUPS_ROOT: "./private/backups",
    });

    expect(config.backupsRootPath).toMatch(/[\\/]private[\\/]backups$/);
  });

  it("resolves the config file's backups_root into the backups path when env is unset", () => {
    // This is the desktop forwarding path (#436): the shell points the sidecar
    // at config.json, and the chosen folder rides in as backups_root.
    const configPath = join(configTempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ backups_root: "./usb/backups" }),
      "utf8",
    );

    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/tuari.sqlite",
      TUARI_CONFIG_FILE: configPath,
    });

    expect(config.backupsRootPath).toMatch(/[\\/]usb[\\/]backups$/);
  });

  it("env APP_BACKUPS_ROOT wins over the config file's backups_root", () => {
    const configPath = join(configTempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ backups_root: "./usb/backups" }),
      "utf8",
    );

    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/tuari.sqlite",
      TUARI_CONFIG_FILE: configPath,
      APP_BACKUPS_ROOT: "./env/backups",
    });

    expect(config.backupsRootPath).toMatch(/[\\/]env[\\/]backups$/);
  });

  it("reads back a folder saved through the persister (restart durability, #436)", () => {
    // The full #436 chain: the setting action writes the config file, and a
    // fresh process reading that file resolves the chosen root. This is what
    // "the choice survives a restart" means; a page reload alone only re-reads
    // the running process's in-memory root.
    const configPath = join(configTempDir, "restart.json");
    const persister = createConfigFileBackupFolderPersister(configPath);
    const savedPath = join(configTempDir, "usb-backups");

    expect(persister.persistBackupsRoot(savedPath)).toEqual({
      success: true,
      persisted: true,
    });

    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_PATH: "./data/tuari.sqlite",
      TUARI_CONFIG_FILE: configPath,
    });

    expect(config.backupsRootPath).toBe(savedPath);
  });

  it("derives database path from DATABASE_URL when set", () => {
    const config = createAppConfig({
      ...requiredAuth,
      DATABASE_URL: "file:./data/from-url.sqlite",
    });

    expect(config.databasePath).toBe("./data/from-url.sqlite");
  });

  // -----------------------------------------------------------------------
  // Database key resolution (issue #265)
  // -----------------------------------------------------------------------

  it("defaults the database key to null when none is configured", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.databaseKey).toBeNull();
  });

  it("resolves APP_DB_KEY into the database key", () => {
    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_KEY: "env-db-key-123",
    });
    expect(config.databaseKey).toBe("env-db-key-123");
  });

  it("treats a blank APP_DB_KEY as no key (plain database)", () => {
    // An explicit-but-blank env key is a deliberate "no key" override: it
    // blocks any config-file db_key in mergeConfigIntoEnv (env wins) and
    // resolves to null here — the same plain-DB outcome as no key at all.
    const config = createAppConfig({
      ...requiredAuth,
      APP_DB_KEY: "   ",
    });
    expect(config.databaseKey).toBeNull();
  });

  it("resolves the config file's db_key into the database key when env is unset", () => {
    const configPath = join(configTempDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ db_key: "config-db-key-123" }), "utf8");

    const config = createAppConfig({
      ...requiredAuth,
      TUARI_CONFIG_FILE: configPath,
    });
    expect(config.databaseKey).toBe("config-db-key-123");
  });

  it("env APP_DB_KEY wins over the config file's db_key", () => {
    const configPath = join(configTempDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ db_key: "config-db-key-123" }), "utf8");

    const config = createAppConfig({
      ...requiredAuth,
      TUARI_CONFIG_FILE: configPath,
      APP_DB_KEY: "env-wins-key-123",
    });
    expect(config.databaseKey).toBe("env-wins-key-123");
  });

  it("rejects non-file DATABASE_URL values", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        DATABASE_URL: "postgres://localhost/tuari",
      }),
    ).toThrow('DATABASE_URL must use a SQLite file: URL');
  });

  // -----------------------------------------------------------------------
  // Server env overrides
  // -----------------------------------------------------------------------

  it("accepts API_HOST and API_PORT as overrides", () => {
    const config = createAppConfig({
      ...requiredAuth,
      API_HOST: "0.0.0.0",
      API_PORT: "8080",
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8080);
  });

  it("trims whitespace from API_HOST", () => {
    // The legacy env module did NOT trim; createAppConfig must.
    const config = createAppConfig({
      ...requiredAuth,
      API_HOST: "  0.0.0.0  ",
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.betterAuthUrl).toBe("http://0.0.0.0:4318");
  });

  it("rejects non-integer API_PORT", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        API_PORT: "abc",
      }),
    ).toThrow("API_PORT must be a positive integer");
  });

  it("rejects out-of-range API_PORT values (must be 1..65535)", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        API_PORT: "0",
      }),
    ).toThrow("API_PORT must be a positive integer between 1 and 65535");

    expect(() =>
      createAppConfig({
        ...requiredAuth,
        API_PORT: "65536",
      }),
    ).toThrow("API_PORT must be a positive integer between 1 and 65535");
  });

  it("derives BETTER_AUTH_URL from an overridden API_PORT", () => {
    const config = createAppConfig({
      ...requiredAuth,
      API_PORT: "8080",
    });

    expect(config.betterAuthUrl).toBe("http://127.0.0.1:8080");
  });

  it("derives the default web origin allowlist from WEB_PORT", () => {
    const config = createAppConfig({
      ...requiredAuth,
      WEB_PORT: "3001",
    });

    expect(config.allowedOrigins).toContain("http://localhost:3001");
    expect(config.allowedOrigins).toContain("http://127.0.0.1:3001");
    // Desktop/framework origins are preserved regardless of the web port.
    expect(config.allowedOrigins).toContain("http://localhost:1420");
    expect(config.allowedOrigins).toContain("tauri://localhost");
    // The old baked-in web port is NOT included when WEB_PORT is overridden.
    expect(config.allowedOrigins).not.toContain("http://localhost:3000");
    expect(config.allowedOrigins).not.toContain("http://127.0.0.1:3000");
  });

  it("keeps the default web origin at 3000 when WEB_PORT is unset", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.allowedOrigins).toContain("http://localhost:3000");
    expect(config.allowedOrigins).toContain("http://127.0.0.1:3000");
  });

  it("lets an explicit ALLOWED_ORIGINS win over WEB_PORT", () => {
    const config = createAppConfig({
      ...requiredAuth,
      WEB_PORT: "3001",
      ALLOWED_ORIGINS: "http://localhost:8080",
    });

    expect(config.allowedOrigins).toEqual(["http://localhost:8080"]);
  });

  it("rejects non-integer or out-of-range WEB_PORT values", () => {
    expect(() =>
      createAppConfig({ ...requiredAuth, WEB_PORT: "abc" }),
    ).toThrow("WEB_PORT must be a positive integer");

    expect(() =>
      createAppConfig({ ...requiredAuth, WEB_PORT: "0" }),
    ).toThrow("WEB_PORT must be a positive integer between 1 and 65535");

    expect(() =>
      createAppConfig({ ...requiredAuth, WEB_PORT: "65536" }),
    ).toThrow("WEB_PORT must be a positive integer between 1 and 65535");
  });

  it("parses ALLOWED_ORIGINS CSV into an array", () => {
    const config = createAppConfig({
      ...requiredAuth,
      ALLOWED_ORIGINS:
        "https://example.com/, https://example.com, http://localhost:3000/",
    });

    expect(config.allowedOrigins).toEqual([
      "https://example.com",
      "http://localhost:3000",
    ]);
  });

  it("skips empty ALLOWED_ORIGINS CSV segments", () => {
    const config = createAppConfig({
      ...requiredAuth,
      ALLOWED_ORIGINS: ",,https://example.com/,,http://localhost:3000,,",
    });

    expect(config.allowedOrigins).toEqual([
      "https://example.com",
      "http://localhost:3000",
    ]);
  });

  it("rejects invalid ALLOWED_ORIGINS values", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        ALLOWED_ORIGINS: "not-a-url",
      }),
    ).toThrow("Invalid origin URL");
  });

  it("honours API_TRUST_PROXY_HEADERS", () => {
    const enabled = createAppConfig({
      ...requiredAuth,
      API_TRUST_PROXY_HEADERS: "true",
    });
    expect(enabled.trustProxyHeaders).toBe(true);

    const disabled = createAppConfig({
      ...requiredAuth,
      API_TRUST_PROXY_HEADERS: "false",
    });
    expect(disabled.trustProxyHeaders).toBe(false);

    const omitted = createAppConfig(requiredAuth);
    expect(omitted.trustProxyHeaders).toBe(false);
  });

  it("honours API_AUTH_RATE_LIMIT_MAX_REQUESTS with a prod default of 30", () => {
    const configured = createAppConfig({
      ...requiredAuth,
      API_AUTH_RATE_LIMIT_MAX_REQUESTS: "500",
    });
    expect(configured.authRateLimitMaxRequests).toBe(500);

    const omitted = createAppConfig(requiredAuth);
    expect(omitted.authRateLimitMaxRequests).toBe(30);

    expect(() =>
      createAppConfig({
        ...requiredAuth,
        API_AUTH_RATE_LIMIT_MAX_REQUESTS: "0",
      }),
    ).toThrow("positive integer");
  });

  it("accepts truthy API_TRUST_PROXY_HEADERS variants case-insensitively", () => {
    for (const value of ["1", "yes", "on", "TRUE"]) {
      const config = createAppConfig({
        ...requiredAuth,
        API_TRUST_PROXY_HEADERS: value,
      });
      expect(config.trustProxyHeaders, value).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Auth env vars
  // -----------------------------------------------------------------------

  it("requires BETTER_AUTH_SECRET", () => {
    expect(() => createAppConfig({})).toThrow("BETTER_AUTH_SECRET is required");
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      createAppConfig({
        BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH",
      }),
    ).toThrow("BETTER_AUTH_SECRET must be at least 32 characters");
  });

  it("rejects a 32+ character BETTER_AUTH_SECRET with insufficient entropy", () => {
    expect(() =>
      createAppConfig({
        BETTER_AUTH_SECRET: "aaaaaaaabbbbbbbbccccccccdddddddd",
      }),
    ).toThrow("BETTER_AUTH_SECRET must have sufficient entropy");
  });

  it("rejects the shipped dev placeholder as BETTER_AUTH_SECRET", () => {
    expect(() =>
      createAppConfig({
        BETTER_AUTH_SECRET: "tuari-dev-secret-at-least-32-characters",
      }),
    ).toThrow("BETTER_AUTH_SECRET must have sufficient entropy");
    expect(() =>
      createAppConfig({
        BETTER_AUTH_SECRET: "replace-with-a-32-plus-char-secret",
      }),
    ).toThrow("BETTER_AUTH_SECRET must have sufficient entropy");
  });

  it("accepts a strong BETTER_AUTH_SECRET", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.betterAuthSecret).toBe(requiredAuth.BETTER_AUTH_SECRET);
  });

  it("normalizes BETTER_AUTH_URL by trimming trailing slashes", () => {
    const config = createAppConfig({
      ...requiredAuth,
      BETTER_AUTH_URL: "https://api.example.com///",
    });

    expect(config.betterAuthUrl).toBe("https://api.example.com");
  });

  it("rejects insecure non-local BETTER_AUTH_URL", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        BETTER_AUTH_URL: "http://api.example.com",
      }),
    ).toThrow("BETTER_AUTH_URL must use https for non-local hosts");
  });

  it("accepts http for any loopback /8 address, not just 127.0.0.1", () => {
    const config = createAppConfig({
      ...requiredAuth,
      BETTER_AUTH_URL: "http://127.0.0.2:4318",
    });

    expect(config.betterAuthUrl).toBe("http://127.0.0.2:4318");
  });

  it("rejects BETTER_AUTH_URL with credentials or query parts", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        BETTER_AUTH_URL: "https://user:pass@example.com?x=1",
      }),
    ).toThrow(
      "BETTER_AUTH_URL must not include credentials, query parameters, or fragments",
    );
  });

  it("defaults BETTER_AUTH_URL to http://host:port when not set", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.betterAuthUrl).toBe("http://127.0.0.1:4318");
  });

  it("treats an empty-string BETTER_AUTH_URL as unset and defaults it", () => {
    const config = createAppConfig({
      ...requiredAuth,
      BETTER_AUTH_URL: "",
    });

    expect(config.betterAuthUrl).toBe("http://127.0.0.1:4318");
  });

  it("treats a whitespace-only BETTER_AUTH_URL as unset and defaults it", () => {
    const config = createAppConfig({
      ...requiredAuth,
      BETTER_AUTH_URL: "   ",
    });

    expect(config.betterAuthUrl).toBe("http://127.0.0.1:4318");
  });

  it("trims surrounding whitespace from a valid BETTER_AUTH_URL", () => {
    const config = createAppConfig({
      ...requiredAuth,
      BETTER_AUTH_URL: "  https://api.example.com/  ",
    });

    expect(config.betterAuthUrl).toBe("https://api.example.com");
  });

  it("derives an https default when API_HOST is non-local", () => {
    const config = createAppConfig({
      ...requiredAuth,
      API_HOST: "api.example.com",
    });

    expect(config.betterAuthUrl).toBe("https://api.example.com:4318");
  });

  it("requires BOOTSTRAP_SETUP_KEY in production", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        NODE_ENV: "production",
      }),
    ).toThrow("BOOTSTRAP_SETUP_KEY is required in production");
  });

  it("rejects a short BOOTSTRAP_SETUP_KEY in production", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        NODE_ENV: "production",
        BOOTSTRAP_SETUP_KEY: "short-key",
      }),
    ).toThrow(
      "BOOTSTRAP_SETUP_KEY must be at least 20 characters with sufficient entropy in production",
    );
  });

  it("rejects a low-entropy BOOTSTRAP_SETUP_KEY in production", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        NODE_ENV: "production",
        BOOTSTRAP_SETUP_KEY: "aaaaaaaaaaaaaaaaaaaa",
      }),
    ).toThrow(
      "BOOTSTRAP_SETUP_KEY must be at least 20 characters with sufficient entropy in production",
    );
  });

  it("accepts a strong BOOTSTRAP_SETUP_KEY in production", () => {
    const config = createAppConfig({
      ...requiredAuth,
      NODE_ENV: "production",
      BOOTSTRAP_SETUP_KEY: productionSetupKey,
    });

    expect(config.bootstrapSetupKey).toBe(productionSetupKey);
  });

  it("accepts BOOTSTRAP_SETUP_KEY in development", () => {
    const config = createAppConfig({
      ...requiredAuth,
      NODE_ENV: "development",
    });

    expect(config.bootstrapSetupKey).toBeNull();
  });

  it("trims whitespace from BOOTSTRAP_SETUP_KEY", () => {
    const config = createAppConfig({
      ...requiredAuth,
      BOOTSTRAP_SETUP_KEY: `  ${productionSetupKey}  `,
    });

    expect(config.bootstrapSetupKey).toBe(productionSetupKey);
  });

  // -----------------------------------------------------------------------
  // Adapter selection
  // -----------------------------------------------------------------------

  it("defaults dbAdapter to sqlite when DB_ADAPTER is not set", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.dbAdapter).toBe("sqlite");
  });

  it("reads DB_ADAPTER env var and validates it", () => {
    const config = createAppConfig({
      ...requiredAuth,
      DB_ADAPTER: "sqlite",
    });
    expect(config.dbAdapter).toBe("sqlite");
  });

  it("accepts the inmemory adapter", () => {
    const config = createAppConfig({
      ...requiredAuth,
      DB_ADAPTER: "inmemory",
    });
    expect(config.dbAdapter).toBe("inmemory");
  });

  it("trims and case-normalizes DB_ADAPTER", () => {
    const config = createAppConfig({
      ...requiredAuth,
      DB_ADAPTER: "  SQLITE  ",
    });
    expect(config.dbAdapter).toBe("sqlite");
  });

  it("rejects invalid DB_ADAPTER values", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        DB_ADAPTER: "postgres",
      }),
    ).toThrow("DB_ADAPTER must be one of: sqlite, inmemory");
  });

  // -----------------------------------------------------------------------
  // Config file support (Phase 5)
  // -----------------------------------------------------------------------

  it("merges config.json values when TUARI_CONFIG_FILE is set", () => {
    const configPath = join(configTempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ db_adapter: "inmemory", db_path: "data/file-config.sqlite" }),
      "utf8",
    );

    const config = createAppConfig({
      ...requiredAuth,
      TUARI_CONFIG_FILE: configPath,
    });

    expect(config.dbAdapter).toBe("inmemory");
    expect(config.databasePath).toBe("data/file-config.sqlite");
  });

  it("env vars override config.json values", () => {
    const configPath = join(configTempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ db_adapter: "inmemory" }),
      "utf8",
    );

    const config = createAppConfig({
      ...requiredAuth,
      TUARI_CONFIG_FILE: configPath,
      DB_ADAPTER: "sqlite",
    });

    expect(config.dbAdapter).toBe("sqlite");
  });

  it("ignores a missing config file gracefully", () => {
    const config = createAppConfig({
      ...requiredAuth,
      TUARI_CONFIG_FILE: join(configTempDir, "missing.json"),
    });

    expect(config.dbAdapter).toBe("sqlite");
  });

  it("returns a typed config object matching the AppConfig interface", () => {
    const config: AppConfig = createAppConfig(requiredAuth);
    expect(config).toHaveProperty("dbAdapter");
    expect(config).toHaveProperty("databasePath");
    expect(config).toHaveProperty("databaseUrl");
    expect(config).toHaveProperty("databaseKey");
    expect(config).toHaveProperty("attachmentsRootPath");
    expect(config).toHaveProperty("backupsRootPath");
    expect(config).toHaveProperty("host");
    expect(config).toHaveProperty("port");
    expect(config).toHaveProperty("allowedOrigins");
    expect(config).toHaveProperty("trustProxyHeaders");
    expect(config).toHaveProperty("betterAuthSecret");
    expect(config).toHaveProperty("betterAuthUrl");
    expect(config).toHaveProperty("bootstrapSetupKey");
  });
});

describe("appConfigSchema port validation", () => {
  // All fields the schema requires (no defaults) — only port varies.
  const validRaw = {
    databasePath: "/tmp/tuari.sqlite",
    databaseUrl: "file:///tmp/tuari.sqlite",
    attachmentsRootPath: "/tmp/attachments",
    backupsRootPath: "/tmp/backups",
    betterAuthSecret: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM",
    betterAuthUrl: "https://api.example.com",
  };

  it("accepts a port within 1..65535 via the schema alone", () => {
    const config = appConfigSchema.parse({ ...validRaw, port: 8080 });
    expect(config.port).toBe(8080);
  });

  it("rejects a zero port via the schema alone", () => {
    expect(() => appConfigSchema.parse({ ...validRaw, port: 0 })).toThrow(
      "Too small",
    );
  });

  it("rejects a port above 65535 via the schema alone", () => {
    expect(() => appConfigSchema.parse({ ...validRaw, port: 65536 })).toThrow(
      "Too big",
    );
  });
});

describe("appConfigSchema betterAuthUrl validation", () => {
  // All fields the schema requires (no defaults) — only betterAuthUrl varies.
  const validRaw = {
    databasePath: "/tmp/tuari.sqlite",
    databaseUrl: "file:///tmp/tuari.sqlite",
    attachmentsRootPath: "/tmp/attachments",
    backupsRootPath: "/tmp/backups",
    betterAuthSecret: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM",
  };

  it("validates and normalizes betterAuthUrl via the schema alone", () => {
    const config = appConfigSchema.parse({
      ...validRaw,
      betterAuthUrl: "https://api.example.com///",
    });
    expect(config.betterAuthUrl).toBe("https://api.example.com");
  });

  it("rejects an insecure non-local URL via the schema alone", () => {
    expect(() =>
      appConfigSchema.parse({ ...validRaw, betterAuthUrl: "http://api.example.com" }),
    ).toThrow("BETTER_AUTH_URL must use https for non-local hosts");
  });

  it("rejects a malformed URL via the schema alone", () => {
    expect(() =>
      appConfigSchema.parse({ ...validRaw, betterAuthUrl: "not a url" }),
    ).toThrow("Invalid BETTER_AUTH_URL");
  });

  it("rejects a non-http(s) protocol via the schema alone", () => {
    expect(() =>
      appConfigSchema.parse({ ...validRaw, betterAuthUrl: "ftp://example.com" }),
    ).toThrow("BETTER_AUTH_URL must use http or https");
  });

  it("rejects credentials via the schema alone", () => {
    expect(() =>
      appConfigSchema.parse({
        ...validRaw,
        betterAuthUrl: "https://user:pass@example.com",
      }),
    ).toThrow(
      "BETTER_AUTH_URL must not include credentials, query parameters, or fragments",
    );
  });

  it("rejects query parts via the schema alone", () => {
    expect(() =>
      appConfigSchema.parse({
        ...validRaw,
        betterAuthUrl: "https://example.com?x=1",
      }),
    ).toThrow(
      "BETTER_AUTH_URL must not include credentials, query parameters, or fragments",
    );
  });
});
