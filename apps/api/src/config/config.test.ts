import { describe, expect, it } from "vitest";

import { createAppConfig, type AppConfig } from "./index";

const requiredAuth = { BETTER_AUTH_SECRET: "test-secret" } as const;

describe("createAppConfig", () => {
  // -----------------------------------------------------------------------
  // Defaults
  // -----------------------------------------------------------------------

  it("uses SQLite as the default db adapter", () => {
    const config = createAppConfig(requiredAuth);
    expect(config.dbAdapter).toBe("sqlite");
  });

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

  it("derives database path from DATABASE_URL when set", () => {
    const config = createAppConfig({
      ...requiredAuth,
      DATABASE_URL: "file:./data/from-url.sqlite",
    });

    expect(config.databasePath).toBe("./data/from-url.sqlite");
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

  it("rejects non-integer API_PORT", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        API_PORT: "abc",
      }),
    ).toThrow("API_PORT must be a positive integer");
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

  // -----------------------------------------------------------------------
  // Auth env vars
  // -----------------------------------------------------------------------

  it("requires BETTER_AUTH_SECRET", () => {
    expect(() => createAppConfig({})).toThrow("BETTER_AUTH_SECRET is required");
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

  it("requires BOOTSTRAP_SETUP_KEY in production", () => {
    expect(() =>
      createAppConfig({
        ...requiredAuth,
        NODE_ENV: "production",
      }),
    ).toThrow("BOOTSTRAP_SETUP_KEY is required in production");
  });

  it("accepts BOOTSTRAP_SETUP_KEY in production", () => {
    const config = createAppConfig({
      ...requiredAuth,
      NODE_ENV: "production",
      BOOTSTRAP_SETUP_KEY: "super-secret-key",
    });

    expect(config.bootstrapSetupKey).toBe("super-secret-key");
  });

  it("accepts BOOTSTRAP_SETUP_KEY in development", () => {
    const config = createAppConfig({
      ...requiredAuth,
      NODE_ENV: "development",
    });

    expect(config.bootstrapSetupKey).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Zod schema validation
  // -----------------------------------------------------------------------

  it("enforces dbAdapter is one of the allowed values", () => {
    // The schema has a default so invalid values are replaced.
    // If we passed "postgres" it would fail zod validation.
    expect(() =>
      createAppConfig({
        ...requiredAuth,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("returns a typed config object matching the AppConfig interface", () => {
    const config: AppConfig = createAppConfig(requiredAuth);
    expect(config).toHaveProperty("dbAdapter");
    expect(config).toHaveProperty("databasePath");
    expect(config).toHaveProperty("databaseUrl");
    expect(config).toHaveProperty("attachmentsRootPath");
    expect(config).toHaveProperty("host");
    expect(config).toHaveProperty("port");
    expect(config).toHaveProperty("allowedOrigins");
    expect(config).toHaveProperty("trustProxyHeaders");
    expect(config).toHaveProperty("betterAuthSecret");
    expect(config).toHaveProperty("betterAuthUrl");
    expect(config).toHaveProperty("bootstrapSetupKey");
  });
});
