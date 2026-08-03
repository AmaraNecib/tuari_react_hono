import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

/** Fresh in-memory SQLite database (connection opened by the composition root). */
const inMemoryDb = ":memory:";

/** The roles seeded by `ensureSeedRoles` on a freshly migrated database. */
const SEEDED_ROLE_KEYS = ["admin", "manager", "viewer"];

beforeEach(() => {
  storageCtorMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Cold-start guard (see .agents/wisdom/testing.md): this suite dynamically
// imports better-auth + the whole dependency graph, and every test now runs
// the full schema migration on its own :memory: connection; under load (e.g.
// the pre-push hook chain) the cold transform can exceed 20s, so keep the
// describe-level timeout generous.
describe("createAppDependencies self-contained wiring", { timeout: 60000 }, () => {
  it("uses the injected config for repository selection (inmemory adapter)", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      DB_ADAPTER: "inmemory",
    });

    const deps = await createAppDependencies(
      { databasePath: inMemoryDb, authInstance: fakeAuth },
      config,
    );

    // The in-memory adapter never touches SQLite: an empty store lists roles
    // without querying the migrated :memory: database.
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

    const deps = await createAppDependencies({ databasePath: inMemoryDb, authInstance: fakeAuth });

    // Default config selects the sqlite adapter, which reads the migrated role
    // table (migrations now run inside the composition root) — proving the
    // injected config in the test above is what switched the adapter.
    expect(deps.companyService).toBeDefined();
    const roles = deps.companyService.listRoles();
    expect(roles.items.map((role) => role.key).sort()).toEqual(SEEDED_ROLE_KEYS);
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
      { databasePath: inMemoryDb, authInstance: fakeAuth },
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
      { databasePath: inMemoryDb, authInstance: fakeAuth },
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

    const deps = await createAppDependencies({ databasePath: inMemoryDb }, config);

    // Exercises the real createAuth(db, config) path — proving the auth
    // instance builds from the injected config rather than a module-load
    // env singleton.
    expect(deps.auth).toBeDefined();
    expect(typeof deps.auth.handler).toBe("function");
  });

  it("creates a real database connection from the resolved config path", async () => {
    const dbDir = mkdtempSync(join(tmpdir(), "tuari-deps-"));
    try {
      vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
      vi.stubEnv("DB_ADAPTER", undefined);
      vi.stubEnv("APP_DB_PATH", join(dbDir, "deps.sqlite"));
      vi.stubEnv("APP_DB_KEY", undefined);
      vi.stubEnv("TUARI_CONFIG_FILE", undefined);
      vi.stubEnv("NODE_ENV", "test");

      const { createAppDependencies } = await import("./dependencies");

      // No databasePath injected — the root resolves the default path from the
      // (stubbed) env and opens a real file-backed connection, migrating + 
      // seeding it.
      const deps = await createAppDependencies({ authInstance: fakeAuth });

      expect(existsSync(join(dbDir, "deps.sqlite"))).toBe(true);
      expect(deps.companyService.listRoles().items).toHaveLength(SEEDED_ROLE_KEYS.length);

      // The raw handle never escapes the root — `close` is the lifecycle seam.
      expect(deps).not.toHaveProperty("rawDatabase");
      deps.close();
    } finally {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it("honors the injected config for the attachments root path", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      APP_ATTACHMENTS_ROOT: "./private/invoices",
    });

    await createAppDependencies(
      { databasePath: inMemoryDb, authInstance: fakeAuth },
      config,
    );

    expect(storageCtorMock).toHaveBeenCalledWith(resolve("./private/invoices"));
  });
});
