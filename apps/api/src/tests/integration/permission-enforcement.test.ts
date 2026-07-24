import { describe, it, expect, vi } from "vitest";
import { ORPCError } from "@orpc/server";

import { createRpcMiddleware } from "../../rpc/rpc-middleware";
import type { RpcContext } from "../../rpc/context";
import type { SessionUser } from "../../modules/session/session.types";
import type { Permission } from "../../modules/rbac/permissions";
import { DEFAULT_ROLE_PERMISSIONS } from "../../modules/rbac/role-seeds";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockUser(permissions: string[] = []): SessionUser & { permissions: string[] } {
  return {
    id: "user-1",
    name: "Test User",
    phone: "0555000001",
    permissions,
  } as SessionUser & { permissions: string[] };
}

function createContext(user: (SessionUser & { permissions: string[] }) | null): RpcContext {
  return {
    headers: new Headers(),
    resolveCurrentUser: () => Promise.resolve(user),
  };
}

// Derive permissions from the canonical RBAC seeds so role drift is caught.
const _roleSeeds = DEFAULT_ROLE_PERMISSIONS;
const ROLE_PERMISSIONS = {
  admin: _roleSeeds.find((s) => s.role.key === "admin")!.permissions,
  manager: _roleSeeds.find((s) => s.role.key === "manager")!.permissions,
  viewer: _roleSeeds.find((s) => s.role.key === "viewer")!.permissions,
} as const satisfies Record<string, readonly Permission[]>;

const DOMAINS = [
  { resource: "employees", actions: ["create", "read", "update", "delete"] },
  { resource: "projects", actions: ["create", "read", "update", "delete"] },
  { resource: "warehouses", actions: ["create", "read", "update", "delete"] },
  { resource: "inventory", actions: ["create", "read", "update", "delete", "transfer"] },
  { resource: "debts", actions: ["create", "read", "update", "settle"] },
  { resource: "invoices", actions: ["create", "read", "update", "delete"] },
  { resource: "payments", actions: ["create", "read", "update", "delete"] },
] as const;

const ALL_PERMISSIONS: Permission[] = [
  "employees:create", "employees:read", "employees:update", "employees:delete",
  "projects:create", "projects:read", "projects:update", "projects:delete",
  "warehouses:create", "warehouses:read", "warehouses:update", "warehouses:delete",
  "inventory:create", "inventory:read", "inventory:update", "inventory:delete", "inventory:transfer",
  "debts:create", "debts:read", "debts:update", "debts:settle",
  "invoices:create", "invoices:read", "invoices:update", "invoices:delete",
  "payments:create", "payments:read", "payments:update", "payments:delete",
];

// ---------------------------------------------------------------------------
// Suite: Permission enforcement across domains
// ---------------------------------------------------------------------------

const middleware = createRpcMiddleware({
  authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
});

describe("Cross-domain: Permission enforcement", () => {

  it("admin can access all resource actions", async () => {
    for (const { resource, actions } of DOMAINS) {
      for (const action of actions) {
        const permission = `${resource}:${action}` as Permission;
        const handler = middleware.withPermission(
          permission,
          async () => ({ allowed: true }),
        );

        await expect(
          handler({
            context: createContext(mockUser([...ROLE_PERMISSIONS.admin])),
            input: {},
          }),
        ).resolves.toEqual({ allowed: true });
      }
    }
  });

  it("manager can perform employees CRUD (create/read/update/delete)", async () => {
    const managerPerms = [...ROLE_PERMISSIONS.manager];
    for (const action of ["create", "read", "update", "delete"] as const) {
      const handler = middleware.withPermission(
        `employees:${action}` as Permission,
        async () => ({ allowed: true }),
      );

      await expect(
        handler({
          context: createContext(mockUser(managerPerms)),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }
  });

  it("manager can perform projects/warehouses/inventory CRUD + inventory transfer", async () => {
    const managerPerms = [...ROLE_PERMISSIONS.manager];
    const allowed: Permission[] = [
      "projects:create", "projects:read", "projects:update", "projects:delete",
      "warehouses:create", "warehouses:read", "warehouses:update", "warehouses:delete",
      "inventory:create", "inventory:read", "inventory:update", "inventory:delete", "inventory:transfer",
    ];
    for (const permission of allowed) {
      const handler = middleware.withPermission(
        permission,
        async () => ({ allowed: true }),
      );
      await expect(
        handler({
          context: createContext(mockUser(managerPerms)),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }
  });

  it("manager can read debts but cannot mutate or settle them", async () => {
    const managerPerms = [...ROLE_PERMISSIONS.manager];

    const allowed: Permission[] = ["debts:read"];
    for (const permission of allowed) {
      const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(managerPerms)),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }

    const denied: Permission[] = ["debts:create", "debts:update", "debts:settle"];
    for (const permission of denied) {
      const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(managerPerms)),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("manager cannot mutate invoices or payments", async () => {
    const managerPerms = [...ROLE_PERMISSIONS.manager];
    const denied: Permission[] = [
      "invoices:create", "invoices:update", "invoices:delete",
      "payments:create", "payments:update", "payments:delete",
    ];
    for (const permission of denied) {
      const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(managerPerms)),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("viewer can read every entity (read-only)", async () => {
    const viewerPerms = [...ROLE_PERMISSIONS.viewer];
    const expectedReads: Permission[] = [
      "employees:read",
      "projects:read",
      "warehouses:read",
      "inventory:read",
      "debts:read",
      "invoices:read",
      "payments:read",
    ];
    for (const permission of expectedReads) {
      const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(viewerPerms)),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }
  });

  it("viewer cannot mutate any entity (403 FORBIDDEN)", async () => {
    const viewerPerms = [...ROLE_PERMISSIONS.viewer];
    const denied: Permission[] = ALL_PERMISSIONS.filter(
      (p) => !(viewerPerms as Permission[]).includes(p),
    );

    for (const permission of denied) {
      const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(viewerPerms)),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("viewer cannot create or update employees (the core acceptance test)", async () => {
    const viewerPerms = [...ROLE_PERMISSIONS.viewer];
    for (const permission of ["employees:create", "employees:update", "employees:delete"] as Permission[]) {
      const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(viewerPerms)),
          input: {},
        }),
      ).rejects.toThrow(ORPCError);
    }
  });

  it("rejects unauthenticated access with UNAUTHORIZED for every domain", async () => {
    for (const { resource, actions } of DOMAINS) {
      for (const action of actions) {
        const permission = `${resource}:${action}` as Permission;
        const handler = middleware.withPermission(
          permission,
          async () => ({ allowed: true }),
        );

        await expect(
          handler({
            context: createContext(null),
            input: {},
          }),
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      }
    }
  });

  it.each([
    ["admin", ROLE_PERMISSIONS.admin],
    ["manager", ROLE_PERMISSIONS.manager],
    ["viewer", ROLE_PERMISSIONS.viewer],
  ] as const)("role %s has the correct permission grants and denials", async (role: string, expected: readonly Permission[]) => {
    const expectedPerms = [...expected];
    // All expected permissions are granted
    for (const perm of expectedPerms) {
      const handler = middleware.withPermission(perm, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(expectedPerms as unknown as string[])),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }

    // Permissions not in the role's set are denied with FORBIDDEN
    const denied = ALL_PERMISSIONS.filter(
      (p) => !(expectedPerms as Permission[]).includes(p),
    );
    for (const perm of denied.slice(0, 5)) {
      const handler = middleware.withPermission(perm, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(expectedPerms as unknown as string[])),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
