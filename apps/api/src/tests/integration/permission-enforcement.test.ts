import { describe, it, expect, vi } from "vitest";
import { ORPCError } from "@orpc/server";

import { createRpcMiddleware } from "../../rpc/rpc-middleware";
import type { RpcContext } from "../../rpc/context";
import type { SessionUser } from "../../modules/session/session.types";
import type { Permission } from "../../modules/rbac/permissions";
import { ALL_PERMISSIONS } from "../../modules/rbac/permissions";
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
// Only `admin` is seeded with permissions; the workforce labels are empty and
// the legacy manager/viewer roles no longer exist.
function permsFor(key: string): readonly Permission[] {
  return DEFAULT_ROLE_PERMISSIONS.find((s) => s.role.key === key)!.permissions;
}
const ROLE_PERMISSIONS = {
  admin: permsFor("admin"),
  worker: permsFor("worker"),
  project_manager: permsFor("project_manager"),
  warehouse_manager: permsFor("warehouse_manager"),
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

// ALL_PERMISSIONS imported from the canonical source in permissions.ts
// to prevent drift. The local type cast keeps the type checker happy
// after the spread into the mutable array used by the tests.
const allPermsSet: Permission[] = [...ALL_PERMISSIONS] as Permission[];

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

  it("workforce labels (empty perms) are denied every permission", async () => {
    // worker / project_manager / warehouse_manager carry no permissions, so
    // a user holding one of those labels can never act. (The former
    // manager/viewer roles are removed entirely.)
    for (const label of ["worker", "project_manager", "warehouse_manager"] as const) {
      const perms = [...ROLE_PERMISSIONS[label]];
      expect(perms).toEqual([]);
      for (const permission of ALL_PERMISSIONS) {
        const handler = middleware.withPermission(permission, async () => ({ allowed: true }));
        await expect(
          handler({
            context: createContext(mockUser(perms)),
            input: {},
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
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

  it.each(
    Object.entries(ROLE_PERMISSIONS) as [string, readonly Permission[]][],
  )("role %s has the correct permission grants and denials", async (role: string, expected: readonly Permission[]) => {
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
