import { describe, it, expect, vi, beforeEach } from "vitest";
import { SqlitePermissionResolver } from "./sqlite-permission-resolver";
import type { Permission } from "../rbac/permissions";

function createMockDb() {
  return {
    prepare: vi.fn().mockReturnThis(),
    all: vi.fn(),
  };
}

describe("SqlitePermissionResolver", () => {
  let db: ReturnType<typeof createMockDb>;
  let resolver: SqlitePermissionResolver;

  beforeEach(() => {
    db = createMockDb();
    resolver = new SqlitePermissionResolver(db as any);
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

  it("queries with correct SQL", async () => {
    db.all.mockReturnValue([]);

    await resolver.getPermissionsForUserId("user-1");

    expect(db.prepare).toHaveBeenCalledTimes(1);
    const call = db.prepare.mock.calls[0];
    expect(call).toBeDefined();
    const sql = call![0];
    expect(sql).toContain("role_permission");
    expect(sql).toContain("employee");
    expect(sql).toContain("role");
    expect(db.all).toHaveBeenCalledWith("user-1");
  });
});
