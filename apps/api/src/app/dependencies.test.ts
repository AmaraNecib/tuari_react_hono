import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

// `env` (infrastructure/config/runtime-env) is built at module load and
// requires BETTER_AUTH_SECRET, so set it before the dynamic import below.
process.env.BETTER_AUTH_SECRET = "test-secret";

import { createAppConfig } from "../config";
import type { BetterAuthInstance } from "../infrastructure/auth/auth";

/** Minimal auth instance — only stored by dependency constructors, never used. */
const fakeAuth = { handler: () => new Response(null, { status: 200 }) } as unknown as BetterAuthInstance;

/** Fresh in-memory SQLite handle with no schema tables. */
const createRawDb = () => new Database(":memory:");

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
});
