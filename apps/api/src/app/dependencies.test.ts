import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

// `env` (infrastructure/config/runtime-env) is built at module load and
// requires BETTER_AUTH_SECRET, so set it before the dynamic import below.
process.env.BETTER_AUTH_SECRET = "test-secret";

import { createAppConfig } from "../config";

/** Minimal auth instance — only stored by dependency constructors, never used. */
const fakeAuth = { handler: () => new Response(null, { status: 200 }) };

/** Fresh in-memory SQLite handle with no schema tables. */
const createRawDb = () => new Database(":memory:") as any;

describe("createAppDependencies config injection", { timeout: 20000 }, () => {
  it("uses the injected config for repository selection (inmemory adapter)", async () => {
    const { createAppDependencies } = await import("./dependencies");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "test-secret",
      DB_ADAPTER: "inmemory",
    });

    const deps = await createAppDependencies(createRawDb(), undefined, fakeAuth as any, config);

    // The in-memory adapter never touches SQLite: an empty store lists roles
    // without querying the schema-less :memory: database.
    expect(deps.companyService.listRoles()).toEqual({ items: [] });
  });

  it("defaults to the sqlite adapter when no config is injected", async () => {
    const { createAppDependencies } = await import("./dependencies");

    const deps = await createAppDependencies(createRawDb(), undefined, fakeAuth as any);

    // Default config selects the sqlite adapter, which queries the (missing)
    // role table in the schema-less :memory: database — proving the injected
    // config in the test above is what switched the adapter.
    expect(deps.companyService).toBeDefined();
    expect(deps.rawDatabase).toBeDefined();
    expect(() => deps.companyService.listRoles()).toThrow(/no such table/);
  });
});
