import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { SqlitePermissionResolver } from "./sqlite-permission-resolver";
import { ALL_PERMISSIONS } from "../permissions";
import type { AppDrizzle } from "../../../infrastructure/database/drizzle";
import * as schema from "../../../schema";

function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    all: vi.fn(),
  };
}

function createMockAuthBootstrap(isOwner: boolean = false) {
  return {
    isBootstrapOwner: vi.fn().mockResolvedValue(isOwner),
  };
}

describe("SqlitePermissionResolver", () => {
  let db: ReturnType<typeof createMockDb>;
  let authBootstrap: ReturnType<typeof createMockAuthBootstrap>;
  let resolver: SqlitePermissionResolver;

  beforeEach(() => {
    db = createMockDb();
    authBootstrap = createMockAuthBootstrap();
    resolver = new SqlitePermissionResolver(db as unknown as AppDrizzle, authBootstrap);
  });

  it("returns permissions for a user", async () => {
    db.all.mockReturnValue([
      { permission: "employees:create" },
      { permission: "employees:read" },
    ]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual(["employees:create", "employees:read"]);
  });

  it("returns empty array when user has no permissions", async () => {
    db.all.mockReturnValue([]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual([]);
  });

  it("returns ALL permissions for bootstrap owner", async () => {
    authBootstrap.isBootstrapOwner.mockResolvedValue(true);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual([...ALL_PERMISSIONS]);
    // Should not query the DB at all
    expect(db.select).not.toHaveBeenCalled();
  });

  it("deduplicates permissions from multiple roles", async () => {
    db.all.mockReturnValue([
      { permission: "employees:create" },
      { permission: "employees:create" },
      { permission: "employees:read" },
    ]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual(["employees:create", "employees:read"]);
  });

  it("passes through stale/unknown permission strings unvalidated (#210 pass-through pinned)", async () => {
    // #210 contract point: a stale `role_permission` row for a removed
    // permission is currently passed through as-is (no isPermission()
    // filter). Pin the pass-through semantics so a future filter change is
    // deliberate — and so a removed permission cannot silently vanish from
    // session payloads without a review.
    // will-change: #210 (if the resolver gains an isPermission() filter,
    // this expectation flips to []).
    db.all.mockReturnValue([{ permission: "employees:removed" }]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual(["employees:removed"]);
  });

  it("returns a fresh copy of ALL_PERMISSIONS — callers cannot corrupt the shared constant", async () => {
    authBootstrap.isBootstrapOwner.mockResolvedValue(true);

    const first = await resolver.getPermissionsForUserId("user-1");
    first.length = 0; // a hostile caller clears the returned list

    expect(ALL_PERMISSIONS.length).toBeGreaterThan(0);
    const second = await resolver.getPermissionsForUserId("user-1");
    expect(second).toEqual([...ALL_PERMISSIONS]);
  });

  it("returns an empty list for an empty userId (no role row can match)", async () => {
    authBootstrap.isBootstrapOwner.mockResolvedValue(false);
    db.all.mockReturnValue([]);

    const perms = await resolver.getPermissionsForUserId("");
    expect(perms).toEqual([]);
    // The empty id is forwarded into the join's WHERE clause verbatim.
    expect(db.where).toHaveBeenCalledWith(eq(schema.user.id, ""));
  });
});
