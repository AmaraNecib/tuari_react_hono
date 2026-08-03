import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { resolve } from "node:path";

import { createAppConfig } from "../config";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";

// Captures the constructor argument of InventoryAttachmentStorage so tests
// can prove `config.attachmentsRootPath` (not `env.*`) reaches the inventory
// storage wiring inside createAppDependencies.
const { storageCtorMock } = vi.hoisted(() => ({ storageCtorMock: vi.fn() }));

vi.mock("../modules/inventory/inventory.storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../modules/inventory/inventory.storage")>();
  return {
    ...actual,
    InventoryAttachmentStorage: class extends actual.InventoryAttachmentStorage {
      constructor(rootPath: string) {
        super(rootPath);
        storageCtorMock(rootPath);
      }
    },
  };
});

/** Minimal auth instance — only stored by dependency constructors, never used. */
const fakeAuth = { handler: () => new Response(null, { status: 200 }) } as unknown as BetterAuthInstance;

/** Fresh in-memory SQLite handle with no schema tables. */
const createRawDb = () => new Database(":memory:");

/**
 * In-memory SQLite handle with the two tables AuthBootstrapService queries
 * via its port (`user`, `app_bootstrap_state`) so setup status is observable
 * without running the full schema migration.
 */
const createBootstrapSchemaDb = () => {
  const rawDb = createRawDb();
  rawDb.exec(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "image" text,
      "phoneNumber" text NOT NULL UNIQUE,
      "phoneNumberVerified" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE TABLE "app_bootstrap_state" (
      "singleton" integer PRIMARY KEY NOT NULL,
      "created_at" text NOT NULL,
      "user_id" text
    );
  `);
  return rawDb;
};

beforeEach(() => {
  storageCtorMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Cold-start guard (see .agents/wisdom/testing.md): this suite dynamically
// imports better-auth + the whole dependency graph; under load (e.g. the
// pre-push hook chain) the cold transform can exceed 20s, so keep the
// describe-level timeout generous.
describe("createAppDependencies config injection", { timeout: 60000 }, () => {
  it("uses the injected config for repository selection (inmemory adapter)", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      DB_ADAPTER: "inmemory",
    });

    const deps = await createAppDependencies(createRawDb(), undefined, fakeAuth, config);

    // The in-memory adapter never touches SQLite: an empty store lists roles
    // without querying the schema-less :memory: database.
    expect(deps.companyService.listRoles()).toEqual({ items: [] });
  });

  it("defaults to the sqlite adapter when no config is injected", async () => {
    // Pin the ambient env so the default `createAppConfig()` path is
    // deterministic regardless of the CI/dev shell environment.
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    vi.stubEnv("DB_ADAPTER", undefined);
    vi.stubEnv("TUARI_CONFIG_FILE", undefined);
    vi.stubEnv("NODE_ENV", "test");

    const { createAppDependencies } = await import("./dependencies");

    const deps = await createAppDependencies(createRawDb(), undefined, fakeAuth);

    // Default config selects the sqlite adapter, which queries the (missing)
    // role table in the schema-less :memory: database — proving the injected
    // config in the test above is what switched the adapter.
    expect(deps.companyService).toBeDefined();
    expect(() => deps.companyService.listRoles()).toThrow(/no such table/);
  });

  it("honors the injected config for the bootstrap setup key", async () => {
    const { createAppDependencies } = await import("./dependencies");
    // Ambient key must not leak in — only the injected config may decide.
    vi.stubEnv("BOOTSTRAP_SETUP_KEY", undefined);
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      BOOTSTRAP_SETUP_KEY: "setup-key-from-config",
    });

    const deps = await createAppDependencies(
      createBootstrapSchemaDb(),
      undefined,
      fakeAuth,
      config,
    );

    // Requires a setup key only because the injected config carries one —
    // previously the code read `env.bootstrapSetupKey` instead and ignored
    // the injected config entirely.
    await expect(deps.authBootstrapService.getSetupStatus()).resolves.toEqual({
      hasUsers: false,
      requiresSetupKey: true,
    });
  });

  it("defaults to no bootstrap setup key when the config has none", async () => {
    const { createAppDependencies } = await import("./dependencies");
    vi.stubEnv("BOOTSTRAP_SETUP_KEY", undefined);
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
    });

    const deps = await createAppDependencies(
      createBootstrapSchemaDb(),
      undefined,
      fakeAuth,
      config,
    );

    await expect(deps.authBootstrapService.getSetupStatus()).resolves.toEqual({
      hasUsers: false,
      requiresSetupKey: false,
    });
  });

  it("builds the real auth instance from the injected config when none is passed", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "http://127.0.0.1:9999",
    });

    const deps = await createAppDependencies(createRawDb(), undefined, undefined, config);

    // Exercises the real createAuth(db, config) path — proving the auth
    // instance builds from the injected config rather than a module-load
    // env singleton.
    expect(deps.auth).toBeDefined();
    expect(typeof deps.auth.handler).toBe("function");
  });

  it("honors the injected config for the attachments root path", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      APP_ATTACHMENTS_ROOT: "./private/invoices",
    });

    await createAppDependencies(createRawDb(), undefined, fakeAuth, config);

    expect(storageCtorMock).toHaveBeenCalledWith(resolve("./private/invoices"));
  });
});
