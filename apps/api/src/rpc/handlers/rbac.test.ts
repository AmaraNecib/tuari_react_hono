/* This file is a black-box test of the implemented router through the
   untyped client proxy and intentionally does not type-check (the client
   type is not derived from the router), hence @ts-nocheck below. */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { ORPCError } from "@orpc/server";

import { RoleModule } from "../../modules/rbac/role.module";
import { InMemoryRoleRepository } from "../../modules/rbac/adapters/in-memory-role.repository";
import { DEFAULT_ROLE_PERMISSIONS } from "../../modules/rbac/role-seeds";
import { createRpcMiddleware, type RpcMiddleware } from "../rpc-middleware";
import type { RpcContext } from "../context";
import { createRbacHandlers } from "./rbac";

function seedRoles() {
  const repository = new InMemoryRoleRepository();
  for (const seed of DEFAULT_ROLE_PERMISSIONS) {
    repository.seed({
      id: `id-${seed.role.key}`,
      key: seed.role.key,
      name: seed.role.name,
      description: seed.role.description,
      isSystem: seed.role.isSystem,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      permissions: [...seed.permissions],
    });
  }
  return repository;
}

function buildMiddleware(): RpcMiddleware {
  return createRpcMiddleware({
    authBootstrapService: { isBootstrapOwner: async () => true },
  });
}

function user(permissions: string[]) {
  return {
    id: "user-1",
    name: "Test",
    phone: "0555000001",
    permissions,
    version: "0.0.0",
  };
}

function context(u: ReturnType<typeof user> | null) {
  return {
    headers: new Headers(),
    resolveCurrentUser: async () => u,
  } as RpcContext;
}

const implementStub = (() => {
  const handlers: Record<string, unknown> = {};
  return (name: string) => {
    if (!handlers[name]) {
      handlers[name] = { handler: (h: unknown) => h };
    }
    return handlers[name];
  };
})();

// Plain call delegating to the inner handler — same as the real oRPC
// adapter, but without the contract types getting in the way of the
// test.
const os = {
  rbacRolesList: implementStub("rbacRolesList"),
  rbacRolesGet: implementStub("rbacRolesGet"),
} as never;

describe("RBAC RPC handlers (Issue #10)", () => {
  it("rbacRolesList returns the four default roles for an admin", async () => {
    const handlers = createRbacHandlers(os, buildMiddleware(), new RoleModule({ repository: seedRoles() }));
    const result = await handlers.rbacRolesList({ context: context(user(["employees:read"])), input: undefined });

    expect(result.items).toHaveLength(4);
    const keys = result.items.map((r: { key: string }) => r.key);
    expect(keys).toContain("admin");
    expect(keys).toContain("project_manager");
    expect(keys).toContain("warehouse_manager");
    expect(keys).toContain("worker");
    // The legacy manager/viewer roles are removed from the seed.
    expect(keys).not.toContain("manager");
    expect(keys).not.toContain("viewer");
  });

  it("rbacRolesList requires authentication (UNAUTHORIZED for missing user)", async () => {
    const handlers = createRbacHandlers(os, buildMiddleware(), new RoleModule({ repository: seedRoles() }));
    await expect(handlers.rbacRolesList({ context: context(null), input: undefined })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rbacRolesList denies users without employees:read (FORBIDDEN)", async () => {
    const handlers = createRbacHandlers(os, buildMiddleware(), new RoleModule({ repository: seedRoles() }));
    // Empty permissions — should not have employees:read.
    await expect(handlers.rbacRolesList({ context: context(user([])), input: undefined })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rbacRolesGet returns a workforce label role with no permissions", async () => {
    const handlers = createRbacHandlers(os, buildMiddleware(), new RoleModule({ repository: seedRoles() }));
    const result = await handlers.rbacRolesGet({ context: context(user(["employees:read"])), input: { id: "id-worker" } });

    expect(result.key).toBe("worker");
    expect(result.permissions).toEqual([]);
  });

  it("rbacRolesGet returns 404 when the role id is unknown", async () => {
    const handlers = createRbacHandlers(os, buildMiddleware(), new RoleModule({ repository: seedRoles() }));
    await expect(
      handlers.rbacRolesGet({ context: context(user(["employees:read"])), input: { id: "missing" } }),
    ).rejects.toBeInstanceOf(ORPCError);
  });
});
