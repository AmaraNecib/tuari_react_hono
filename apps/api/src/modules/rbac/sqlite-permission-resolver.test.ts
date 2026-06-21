import { describe, it, expect, vi, beforeEach } from "vitest";
import { SqlitePermissionResolver } from "./sqlite-permission-resolver";
import type { Permission } from "../rbac/permissions";
import { ALL_PERMISSIONS } from "./permissions";

function createMockDb() {
  return {
    prepare: vi.fn().mockReturnThis(),
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
    resolver = new SqlitePermissionResolver(db as any, authBootstrap as any);
  });

  it("returns permissions for a user", async () => {
    db.all.mockReturnValue([
      { permission: "employees.create" },
      { permission: "employees.read" },
    ]);

    const perms = await resolver.getPermissionsForUserId("user-1");
    expect(perms).toEqual(["employees.create", "employees.read"]);
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
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("queries with correct SQL for non-owners", async () => {
    db.all.mockReturnValue([]);

    await resolver.getPermissionsForUserId("user-1");

    expect(db.prepare).toHaveBeenCalledTimes(1);
    const call = db.prepare.mock.calls[0];
    expect(call).toBeDefined();
    const sql = call![0];
    expect(sql).toContain("role_permission");
    expect(sql).toContain("employee");
    expect(sql).toContain("role");
    expect(sql).toContain("user");
    expect(sql).toContain("phoneNumber");
    expect(db.all).toHaveBeenCalledWith("user-1");
  });
});
