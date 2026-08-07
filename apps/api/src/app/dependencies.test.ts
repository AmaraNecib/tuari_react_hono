import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createAppConfig } from "../config";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";

// Captures the constructor argument of InventoryAttachmentStorage so tests
// can prove `config.attachmentsRootPath` (not `env.*`) reaches the inventory
// storage wiring inside createAppDependencies.
const { storageCtorMock, dbKeyCapture } = vi.hoisted(() => ({ storageCtorMock: vi.fn(), dbKeyCapture: vi.fn() }));

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

// Captures the database key passed to the connection factory so the
// `config.databaseKey` wiring can be pinned without depending on the SQLCipher
// native binding being built (it is not in every environment). The key is
// stripped here so the plain better-sqlite3 connection opens as usual.
vi.mock("../infrastructure/database/factory", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../infrastructure/database/factory")>();
  return {
    ...actual,
    createDatabaseConnection: (databasePath?: string, databaseKey?: string | null) => {
      dbKeyCapture(databaseKey);
      return actual.createDatabaseConnection(databasePath, undefined);
    },
  };
});

const TEST_AUTH_SECRET = "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM";

/** Minimal auth instance — only stored by dependency constructors, never used. */
const fakeAuth = { handler: () => new Response(null, { status: 200 }) } as unknown as BetterAuthInstance;

/** Fresh in-memory SQLite database (connection opened by the composition root). */
const inMemoryDb = ":memory:";

/** The roles seeded by `ensureSeedRoles` on a freshly migrated database. */
const SEEDED_ROLE_KEYS = ["admin", "manager", "viewer"];

/** Pin ambient env so the default `createAppConfig()` path is deterministic. */
const stubCleanEnv = () => {
  vi.stubEnv("BETTER_AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("DB_ADAPTER", undefined);
  vi.stubEnv("APP_DB_KEY", undefined);
  vi.stubEnv("TUARI_CONFIG_FILE", undefined);
  vi.stubEnv("NODE_ENV", "test");
};

/** Last created dependency graph, closed in afterEach (idempotent close). */
let lastDeps: { close: () => void } | undefined;

beforeEach(() => {
  storageCtorMock.mockClear();
  dbKeyCapture.mockClear();
  stubCleanEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  lastDeps?.close();
  lastDeps = undefined;
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
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      DB_ADAPTER: "inmemory",
    });

    const deps = await createAppDependencies(
      { databasePath: inMemoryDb, authInstance: fakeAuth },
      config,
    );
    lastDeps = deps;

    // The in-memory adapter never touches SQLite: an empty store lists roles
    // without querying the migrated :memory: database.
    expect(deps.companyService.listRoles()).toEqual({ items: [] });
  });

  it("defaults to the sqlite adapter when no config is injected", async () => {
    const { createAppDependencies } = await import("./dependencies");

    const deps = await createAppDependencies({ databasePath: inMemoryDb, authInstance: fakeAuth });
    lastDeps = deps;

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
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BOOTSTRAP_SETUP_KEY: "setup-key-from-config",
    });

    const deps = await createAppDependencies(
      { databasePath: inMemoryDb, authInstance: fakeAuth },
      config,
    );
    lastDeps = deps;

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
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    });

    const deps = await createAppDependencies(
      { databasePath: inMemoryDb, authInstance: fakeAuth },
      config,
    );
    lastDeps = deps;

    await expect(deps.authBootstrapService.getSetupStatus()).resolves.toEqual({
      hasUsers: false,
      requiresSetupKey: false,
    });
  });

  it("builds the real auth instance from the injected config when none is passed", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: "http://127.0.0.1:9999",
    });

    const deps = await createAppDependencies({ databasePath: inMemoryDb }, config);
    lastDeps = deps;

    // Exercises the real createAuth(db, config) path — proving the auth
    // instance builds from the injected config rather than a module-load
    // env singleton.
    expect(deps.auth).toBeDefined();
    expect(typeof deps.auth.handler).toBe("function");
  });

  it("creates a real database connection from the resolved config path", async () => {
    const dbDir = mkdtempSync(join(tmpdir(), "tuari-deps-"));
    try {
      vi.stubEnv("APP_DB_PATH", join(dbDir, "deps.sqlite"));

      const { createAppDependencies } = await import("./dependencies");

      // No databasePath injected — the root resolves the default path from the
      // (stubbed) env and opens a real file-backed connection, migrating + 
      // seeding it.
      const deps = await createAppDependencies({ authInstance: fakeAuth });
      lastDeps = deps;

      expect(existsSync(join(dbDir, "deps.sqlite"))).toBe(true);
      expect(deps.companyService.listRoles().items).toHaveLength(SEEDED_ROLE_KEYS.length);

      // The raw handle never escapes the root — `close` is the lifecycle seam.
      expect(deps).not.toHaveProperty("rawDatabase");
      deps.close();
    } finally {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it("forwards an injected databaseKey to the connection factory", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET });

    const deps = await createAppDependencies(
      { databasePath: inMemoryDb, databaseKey: "test-db-key", authInstance: fakeAuth },
      config,
    );
    lastDeps = deps;

    // The key reaches the connection factory (the mocked seam strips it so the
    // plain better-sqlite3 connection opens here; the SQLCipher path itself is
    // the factory's concern and requires the native binding).
    expect(dbKeyCapture).toHaveBeenCalledWith("test-db-key");
    expect(deps.companyService.listRoles().items).toHaveLength(SEEDED_ROLE_KEYS.length);
  });

  it("honors the injected config for the attachments root path", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      APP_ATTACHMENTS_ROOT: "./private/invoices",
    });

    const deps = await createAppDependencies(
      { databasePath: inMemoryDb, authInstance: fakeAuth },
      config,
    );
    lastDeps = deps;

    expect(storageCtorMock).toHaveBeenCalledWith(resolve("./private/invoices"));
  });
});
