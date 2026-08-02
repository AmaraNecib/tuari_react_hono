import { describe, it, expect, vi, beforeEach } from "vitest";
import { SqlitePermissionResolver } from "./permission-resolver";
import type { Permission } from "../rbac/permissions";
import { ALL_PERMISSIONS } from "./permissions";
import type { AppDrizzle } from "../../infrastructure/database/drizzle";

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
    resolver = new SqlitePermissionResolver({} as { exec: (sql: string) => void }, authBootstrap, db as unknown as AppDrizzle);
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
});
