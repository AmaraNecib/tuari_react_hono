import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
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

    it("skips legacy dot-separated permission strings (isPermission guard)", async () => {
      db.all.mockReturnValue([
        roleRow({ permission: "employees.create" }), // legacy dot form — must be skipped
        roleRow({ permission: "employees:create" }),
      ]);

      const roles = await repository.findAll();

      expect(roles[0]!.permissions).toEqual(["employees:create"]);
    });
  });

  describe("findById()", () => {
    it("returns the matching role with its permissions", async () => {
      db.all.mockReturnValue([
        roleRow({ id: "role-1", permission: "inventory:transfer" }),
        roleRow({ id: "role-1", permission: "inventory:read" }),
      ]);

      const role = await repository.findById("role-1");

      expect(role).toEqual(
        expect.objectContaining({
          id: "role-1",
          permissions: ["inventory:transfer", "inventory:read"],
        }),
      );
      // The adapter filters by the role id column, not a raw value.
      expect(db.where).toHaveBeenCalledWith(eq(schema.role.id, "role-1"));
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
