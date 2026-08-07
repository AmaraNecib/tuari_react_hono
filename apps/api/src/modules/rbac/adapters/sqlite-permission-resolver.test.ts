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

  it("filters stale, legacy and malformed rows through the isPermission guard (#266)", async () => {
    // #266 decision: the resolver now runs every row through isPermission(),
    // matching the role repository's read path. A stale row for a removed
    // permission (employees:removed), a legacy dot-form row
    // (employees.create), or a multi-colon row (employees:create:extra)
    // must not leak into the resolved Permission[]. This deliberately flips
    // the #210 pass-through pin, which anticipated this exact change.
    db.all.mockReturnValue([
      { permission: "employees:removed" },
      { permission: "employees.create" },
      { permission: "employees:create:extra" },
      { permission: "employees:create" },
    ]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual(["employees:create"]);
  });

  it("still deduplicates canonical permissions while filtering (#266)", async () => {
    db.all.mockReturnValue([
      { permission: "employees:create" },
      { permission: "employees:create" },
      { permission: "employees.read" }, // legacy dot form — dropped
      { permission: "employees:read" },
    ]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual(["employees:create", "employees:read"]);
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
