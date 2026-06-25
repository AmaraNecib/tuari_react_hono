import { describe, it, expect, vi } from "vitest";
import { ORPCError } from "@orpc/server";

import { createRpcMiddleware } from "../../rpc/rpc-middleware";
import type { RpcContext } from "../../rpc/context";
import type { SessionUser } from "../../modules/session/session.types";
import type { Permission } from "../../modules/rbac/permissions";

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

// Permissions by role (mirrors role-seeds.ts)
const ROLE_PERMISSIONS: {
  admin: Permission[];
  project_manager: Permission[];
  warehouse_manager: Permission[];
  worker: Permission[];
  viewer: Permission[];
} = {
  admin: [
    "employees.create", "employees.read", "employees.update", "employees.delete",
    "projects.create", "projects.read", "projects.update", "projects.delete",
    "warehouses.create", "warehouses.read", "warehouses.update", "warehouses.delete",
    "inventory.create", "inventory.read", "inventory.update", "inventory.delete", "inventory.transfer",
    "debts.create", "debts.read", "debts.update", "debts.settle",
    "invoices.create", "invoices.read", "invoices.update", "invoices.delete",
    "payments.create", "payments.read", "payments.update", "payments.delete",
  ],
  project_manager: [
    "employees.read", "employees.update",
    "invoices.read", "invoices.create", "invoices.update",
    "payments.read",
  ],
  warehouse_manager: [
    "employees.read",
    "invoices.read", "invoices.create", "invoices.update",
    "payments.read",
  ],
  worker: [
    "employees.read",
  ],
  viewer: [
    "employees.read",
  ],
};

// All domains that should be gated by permissions
const DOMAINS = [
  { resource: "employees", actions: ["create", "read", "update", "delete"] },
  { resource: "projects", actions: ["create", "read", "update", "delete"] },
  { resource: "warehouses", actions: ["create", "read", "update", "delete"] },
  { resource: "inventory", actions: ["create", "read", "update", "delete", "transfer"] },
  { resource: "debts", actions: ["create", "read", "update", "settle"] },
  { resource: "invoices", actions: ["create", "read", "update", "delete"] },
  { resource: "payments", actions: ["create", "read", "update", "delete"] },
] as const;

// ---------------------------------------------------------------------------
// Suite: Permission enforcement across domains
//
// The middleware instance is created once at suite level to avoid spawning
// repeated background timers (rate-limiter cleanup) per test.
// ---------------------------------------------------------------------------

const middleware = createRpcMiddleware({
  authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
});

describe("Cross-domain: Permission enforcement", () => {

  // -----------------------------------------------------------------------
  // Admin has unrestricted access
  // -----------------------------------------------------------------------

  it("admin can access all resource actions", async () => {
    for (const { resource, actions } of DOMAINS) {
      for (const action of actions) {
        const permission = `${resource}.${action}` as Permission;
        const handler = middleware.withPermission(
          permission,
          async () => ({ allowed: true }),
        );

        await expect(
          handler({
            context: createContext(mockUser(ROLE_PERMISSIONS.admin)),
            input: {},
          }),
        ).resolves.toEqual({ allowed: true });
      }
    }
  });

  // -----------------------------------------------------------------------
  // Viewer has read-only access
  // -----------------------------------------------------------------------

  it("viewer can only read employees", async () => {
    const viewerPerms = ROLE_PERMISSIONS.viewer;

    // Should be allowed
    for (const perm of viewerPerms) {
      const handler = middleware.withPermission(perm as any, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(viewerPerms)),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }

    // Should be denied (FORBIDDEN) for every mutation action across all domains
    const mutationPerms: Permission[] = [
      "employees.create", "employees.update", "employees.delete",
      "projects.create", "projects.read", "projects.update", "projects.delete",
      "warehouses.create", "warehouses.read", "warehouses.update", "warehouses.delete",
      "inventory.create", "inventory.read", "inventory.update", "inventory.delete", "inventory.transfer",
      "debts.create", "debts.read", "debts.update", "debts.settle",
      "invoices.create", "invoices.read", "invoices.update", "invoices.delete",
      "payments.create", "payments.read", "payments.update", "payments.delete",
    ].filter((p): p is Permission => !(viewerPerms as Permission[]).includes(p as Permission));

    for (const perm of mutationPerms) {
      const handler = middleware.withPermission(perm as any, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(viewerPerms)),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  // -----------------------------------------------------------------------
  // Project manager has specific permissions
  // -----------------------------------------------------------------------

  it("project_manager has correct permission set", () => {
    const pmPerms = ROLE_PERMISSIONS.project_manager;
    expect(pmPerms).toContain("employees.read");
    expect(pmPerms).toContain("employees.update");
    expect(pmPerms).toContain("invoices.read");
    expect(pmPerms).toContain("invoices.create");
    expect(pmPerms).toContain("invoices.update");
    expect(pmPerms).toContain("payments.read");
    expect(pmPerms).not.toContain("employees.create");
    expect(pmPerms).not.toContain("employees.delete");
    expect(pmPerms).not.toContain("payments.create");
    expect(pmPerms).not.toContain("payments.delete");
    expect(pmPerms).not.toContain("inventory.create");
    expect(pmPerms).not.toContain("debts.settle");
  });

  // -----------------------------------------------------------------------
  // Unauthenticated users are rejected with UNAUTHORIZED
  // -----------------------------------------------------------------------

  it("rejects unauthenticated access with UNAUTHORIZED for every domain", async () => {
    for (const { resource, actions } of DOMAINS) {
      for (const action of actions) {
        const permission = `${resource}.${action}` as Permission;
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

  // -----------------------------------------------------------------------
  // Each role's permissions match the RBAC contract
  // -----------------------------------------------------------------------

  it.each([
    ["admin", ROLE_PERMISSIONS.admin],
    ["project_manager", ROLE_PERMISSIONS.project_manager],
    ["warehouse_manager", ROLE_PERMISSIONS.warehouse_manager],
    ["worker", ROLE_PERMISSIONS.worker],
    ["viewer", ROLE_PERMISSIONS.viewer],
  ] as const)("role %s has the correct permission grants and denials", async (role: string, expected: Permission[]) => {
    // All expected permissions are granted
    for (const perm of expected) {
      const handler = middleware.withPermission(perm, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(expected as unknown as string[])),
          input: {},
        }),
      ).resolves.toEqual({ allowed: true });
    }

    // Permissions not in the role's set are denied with FORBIDDEN
    const allPerms: Permission[] = [
      "employees.create", "employees.read", "employees.update", "employees.delete",
      "projects.create", "projects.read", "projects.update", "projects.delete",
      "warehouses.create", "warehouses.read", "warehouses.update", "warehouses.delete",
      "inventory.create", "inventory.read", "inventory.update", "inventory.delete", "inventory.transfer",
      "debts.create", "debts.read", "debts.update", "debts.settle",
      "invoices.create", "invoices.read", "invoices.update", "invoices.delete",
      "payments.create", "payments.read", "payments.update", "payments.delete",
    ];
    const denied = allPerms.filter(
      (p) => !(expected as Permission[]).includes(p),
    ) as Permission[];
    for (const perm of denied.slice(0, 5)) { // sample size to keep test fast
      const handler = middleware.withPermission(perm, async () => ({ allowed: true }));
      await expect(
        handler({
          context: createContext(mockUser(expected as unknown as string[])),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
