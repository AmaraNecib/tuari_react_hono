import { describe, it, expect, vi, beforeEach } from "vitest";
import { asc, eq } from "drizzle-orm";
import { SqliteRoleRepository } from "./sqlite-role.repository";
import * as schema from "../../../schema";
import type { AppDrizzle } from "../../../infrastructure/database/drizzle";

/**
 * Mock the Drizzle query-builder chain. `SqliteRoleRepository` only builds
 * select → from → leftJoin → (where) → orderBy → all, so a chain of
 * `mockReturnThis()` stubs plus a settable `all` is enough to exercise the
 * adapter's grouping logic without a real database.
 */
function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    all: vi.fn(),
  };
}

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: number;
  createdAt: string;
  updatedAt: string;
  permission: string | null;
};

/** Flat (role, permission) row as the LEFT JOIN would return it. */
function roleRow(overrides: Partial<RoleRow>): RoleRow {
  return {
    id: "role-1",
    key: "admin",
    name: "مدير",
    description: null,
    isSystem: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    permission: null,
    ...overrides,
  };
}

describe("SqliteRoleRepository", () => {
  let db: ReturnType<typeof createMockDb>;
  let repository: SqliteRoleRepository;

  beforeEach(() => {
    db = createMockDb();
    repository = new SqliteRoleRepository(db as unknown as AppDrizzle);
  });

  describe("findAll()", () => {
    it("groups flat role rows into one RoleWithPermissions per role, preserving query order", async () => {
      db.all.mockReturnValue([
        roleRow({ id: "role-2", key: "manager", name: "مدير عمليات", permission: "employees:create" }),
        roleRow({ id: "role-1", key: "admin", name: "مدير", permission: "employees:read" }),
        roleRow({ id: "role-1", key: "admin", name: "مدير", permission: "employees:create" }),
      ]);

      const roles = await repository.findAll();

      expect(roles).toEqual([
        {
          id: "role-2",
          key: "manager",
          name: "مدير عمليات",
          description: null,
          isSystem: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          permissions: ["employees:create"],
        },
        {
          id: "role-1",
          key: "admin",
          name: "مدير",
          description: null,
          isSystem: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          permissions: ["employees:read", "employees:create"],
        },
      ]);
      // The SQL shape: LEFT JOIN on role_permission and ORDER BY role key
      // then permission — a regression in either clause would otherwise be
      // invisible to the chain mock.
      expect(db.leftJoin).toHaveBeenCalledWith(
        schema.rolePermission,
        eq(schema.rolePermission.roleId, schema.role.id),
      );
      expect(db.orderBy).toHaveBeenCalledWith(
        asc(schema.role.key),
        asc(schema.rolePermission.permission),
      );
    });

    it("returns an empty array when there are no roles", async () => {
      db.all.mockReturnValue([]);

      expect(await repository.findAll()).toEqual([]);
    });

    it("preserves a non-null description", async () => {
      db.all.mockReturnValue([roleRow({ description: "مشرف النظام" })]);

      const [role] = await repository.findAll();

      expect(role!.description).toBe("مشرف النظام");
    });

    it("maps only the integer 1 to isSystem true", async () => {
      db.all.mockReturnValue([
        roleRow({ id: "role-1", isSystem: 1 }),
        roleRow({ id: "role-2", isSystem: 0 }),
      ]);

      const roles = await repository.findAll();

      expect(roles.map((r) => r.isSystem)).toEqual([true, false]);
    });

    it("treats an empty permission string as no permission", async () => {
      db.all.mockReturnValue([roleRow({ permission: "" })]);

      const [role] = await repository.findAll();

      expect(role!.permissions).toEqual([]);
    });

    it("skips colon-form permissions with unknown resource or action", async () => {
      db.all.mockReturnValue([
        roleRow({ permission: "billing:create" }),
        roleRow({ permission: "employees:fly" }),
        roleRow({ permission: "employees:read" }),
      ]);

      const [role] = await repository.findAll();

      expect(role!.permissions).toEqual(["employees:read"]);
    });

    it("skips legacy dot-separated permission strings (isPermission guard)", async () => {
      db.all.mockReturnValue([
        roleRow({ permission: "employees.create" }), // legacy dot form — must be skipped
        roleRow({ permission: "employees:create" }),
      ]);

      const roles = await repository.findAll();

      expect(roles).toHaveLength(1);
      expect(roles[0]!.permissions).toEqual(["employees:create"]);
    });

    it("returns a role with an empty permission list when the LEFT JOIN misses", async () => {
      db.all.mockReturnValue([
        roleRow({ id: "role-1", key: "viewer", name: "مشاهد", isSystem: 0, permission: null }),
      ]);

      const roles = await repository.findAll();

      expect(roles).toEqual([
        expect.objectContaining({ key: "viewer", isSystem: false, permissions: [] }),
      ]);
    });

    it("returns the role with empty permissions when every row is legacy", async () => {
      db.all.mockReturnValue([roleRow({ permission: "employees.create" })]);

      const roles = await repository.findAll();

      expect(roles).toHaveLength(1);
      expect(roles[0]!.permissions).toEqual([]);
      expect(roles[0]!.id).toBe("role-1");
    });
  });

  describe("findById()", () => {
    it("returns the matching role with its permissions", async () => {
      // Rows are fed in the order the ORDER BY permission clause returns.
      db.all.mockReturnValue([
        roleRow({ id: "role-1", permission: "inventory:read" }),
        roleRow({ id: "role-1", permission: "inventory:transfer" }),
      ]);

      const role = await repository.findById("role-1");

      expect(role).toEqual(
        expect.objectContaining({
          id: "role-1",
          permissions: ["inventory:read", "inventory:transfer"],
        }),
      );
      // The adapter filters by the role id column, not a raw value.
      expect(db.where).toHaveBeenCalledWith(eq(schema.role.id, "role-1"));
      // Permissions are deterministic — same ORDER BY as findAll (single role).
      expect(db.orderBy).toHaveBeenCalledWith(asc(schema.rolePermission.permission));
    });

    it("returns null when the id matches no role", async () => {
      db.all.mockReturnValue([]);

      expect(await repository.findById("missing")).toBeNull();
      expect(db.where).toHaveBeenCalledWith(eq(schema.role.id, "missing"));
    });

    it("returns a role with an empty permission list when the LEFT JOIN misses", async () => {
      db.all.mockReturnValue([roleRow({ id: "role-1", permission: null })]);

      const role = await repository.findById("role-1");

      expect(role).toEqual(expect.objectContaining({ id: "role-1", permissions: [] }));
    });
  });

  describe("findByKey()", () => {
    it("returns the matching role by stable key", async () => {
      db.all.mockReturnValue([roleRow({ key: "manager", permission: "debts:settle" })]);

      const role = await repository.findByKey("manager");

      expect(role).toEqual(expect.objectContaining({ key: "manager", permissions: ["debts:settle"] }));
      // The adapter filters by the stable key column, not the id.
      expect(db.where).toHaveBeenCalledWith(eq(schema.role.key, "manager"));
      // Permissions are deterministic — same ORDER BY as findAll (single role).
      expect(db.orderBy).toHaveBeenCalledWith(asc(schema.rolePermission.permission));
    });

    it("returns null when the key matches no role", async () => {
      db.all.mockReturnValue([]);

      expect(await repository.findByKey("worker")).toBeNull();
      expect(db.where).toHaveBeenCalledWith(eq(schema.role.key, "worker"));
    });

    it("returns a role with an empty permission list when the LEFT JOIN misses", async () => {
      db.all.mockReturnValue([roleRow({ key: "viewer", permission: null })]);

      const role = await repository.findByKey("viewer");

      expect(role).toEqual(expect.objectContaining({ key: "viewer", permissions: [] }));
    });
  });
});
