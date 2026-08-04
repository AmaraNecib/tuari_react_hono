import { describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"

import { orpc } from "@/lib/orpc-client"
import {
  getCachedSessionUserId,
  invalidateUserScopedQuery,
  invalidateWorkspaceDomains,
  workspaceDomainQueryPrefix,
  workspaceQueryKeys,
} from "./workspace-keys"

const userId = "user-236"

function mockQueryClient() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined)
  return {
    invalidateQueries,
    client: { invalidateQueries } as unknown as Pick<QueryClient, "invalidateQueries">,
  }
}

describe("workspaceQueryKeys", () => {
  it("scopes every key with the workspace-domain namespace and the userId", () => {
    const entries = Object.entries(workspaceQueryKeys) as Array<
      [string, (...args: unknown[]) => readonly unknown[]]
    >

    expect(entries.length).toBeGreaterThan(0)
    for (const [, factory] of entries) {
      const key = factory(userId)
      expect(key[0]).toBe("phase1")
      expect(key[1]).toBe("workspace-domain")
      expect(key[2]).toBeTypeOf("string")
      expect(key).toContain(userId)
    }
  })

  it("collapses the five duplicated endpoints to one key each", () => {
    const names = new Set(Object.keys(workspaceQueryKeys))

    // These endpoints were previously fetched under BOTH a workspace-domain
    // key and an inventory-namespace key — one key per endpoint now.
    for (const domain of ["warehouses", "projects", "externalCounterparties", "inventoryItems", "inventoryInvoices"]) {
      expect(names.has(domain)).toBe(true)
    }
  })

  it("does not resurrect the dead 'inventory' workspace-domain key", () => {
    expect(Object.keys(workspaceQueryKeys)).not.toContain("inventory")
  })

  it("derives the flat invalidation vocabulary from the factory (one entry per flat endpoint)", () => {
    // The `WorkspaceDomain` record accepted by `invalidateWorkspaceDomains`
    // is derived by arity (`Parameters<entry>["length"] extends 1`) from the
    // factory. Function.length is the runtime twin (flat keys declare a
    // single optional-or-required userId param → length 0–1; parameterized
    // keys declare two required params → length 2), so pin the flat
    // membership explicitly: a key added with the wrong arity silently joins
    // (or leaves) the invalidation vocabulary and this test fails until the
    // intent is made explicit.
    const flatFactoryEntries = Object.entries(workspaceQueryKeys)
      .filter(([, factory]) => factory.length <= 1)
      .map(([name]) => name)
      .sort()

    expect(flatFactoryEntries).toEqual([
      "debtAccounts", "debtsDetail", "debtsSummary", "employeeStateHistory",
      "employees", "externalCounterparties", "inventoryInvoices",
      "inventoryItems", "inventoryOutboundTransfers", "managerAssignments",
      "projectAssignments", "projectManagerOwnership", "projects", "roles",
      "salaryPayments", "systemLog", "warehouseAssignments",
      "warehouseManagerOwnership", "warehouses",
    ])
  })

  it("keeps the parameterized detail keys user-scoped and parameter-scoped", () => {
    expect(workspaceQueryKeys.inventoryAsset(userId, "asset-1")).toEqual([
      "phase1", "workspace-domain", "inventory-asset", userId, "asset-1",
    ])
    expect(workspaceQueryKeys.inventoryInvoiceGroup(userId, "inv-1")).toEqual([
      "phase1", "workspace-domain", "inventory-invoice-groups", userId, "inv-1",
    ])
    expect(workspaceQueryKeys.inventoryLocationContents(userId, { warehouseId: "w-1" })).toEqual([
      "phase1", "workspace-domain", "inventory-location-contents", userId, { warehouseId: "w-1" },
    ])
    expect(workspaceQueryKeys.inventoryOutboundTransfers(userId)).toEqual([
      "phase1", "workspace-domain", "inventory-outbound-transfers", userId,
    ])
    expect(workspaceQueryKeys.employeeDebtAccount(userId, "employee-1")).toEqual([
      "phase1", "workspace-domain", "employee-debt-account", userId, "employee-1",
    ])
  })
})

describe("invalidateWorkspaceDomains", () => {
  it("invalidates exactly the requested domains with the resolved userId", async () => {
    const { invalidateQueries, client } = mockQueryClient()

    await invalidateWorkspaceDomains(client, userId, { warehouses: true, projects: true })

    expect(invalidateQueries).toHaveBeenCalledTimes(2)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceQueryKeys.warehouses(userId) })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceQueryKeys.projects(userId) })
  })

  it("falls back to the whole domain prefix when the userId is unknown", async () => {
    const { invalidateQueries, client } = mockQueryClient()

    await invalidateWorkspaceDomains(client, null, { warehouses: true })

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceDomainQueryPrefix })
  })

  it("is a no-op for an empty domain record", async () => {
    const { invalidateQueries, client } = mockQueryClient()

    await invalidateWorkspaceDomains(client, userId, {})

    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it("is a no-op for an empty record even when the userId is unknown", async () => {
    const { invalidateQueries, client } = mockQueryClient()

    await invalidateWorkspaceDomains(client, null, {})

    expect(invalidateQueries).not.toHaveBeenCalled()
  })
})

describe("invalidateUserScopedQuery", () => {
  it("invalidates the exact parameterized key for a resolved user", async () => {
    const { invalidateQueries, client } = mockQueryClient()

    await invalidateUserScopedQuery(client, userId, (uid) => workspaceQueryKeys.inventoryAsset(uid, "asset-1"))

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceQueryKeys.inventoryAsset(userId, "asset-1") })
  })

  it("falls back to the whole domain prefix when the userId is unknown", async () => {
    const { invalidateQueries, client } = mockQueryClient()

    await invalidateUserScopedQuery(client, null, (uid) => workspaceQueryKeys.inventoryAsset(uid, "asset-1"))

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workspaceDomainQueryPrefix })
  })
})

describe("getCachedSessionUserId", () => {
  const SESSION_USER = { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" }

  function makeClient() {
    return new QueryClient()
  }

  it("resolves the user id from the key the session query mounts under", () => {
    const client = makeClient()
    client.setQueryData(orpc.session.queryOptions().queryKey, { user: SESSION_USER })

    expect(getCachedSessionUserId(client)).toBe("user-1")
  })

  it("does not resolve from the bare orpc.session.key() (the pre-fix bug)", () => {
    const client = makeClient()
    // `orpc.session.key()` omits `type: "query"` and never matches the cache.
    client.setQueryData(orpc.session.key(), { user: SESSION_USER })

    expect(getCachedSessionUserId(client)).toBeNull()
  })

  it("returns null when the session has not resolved or has no user", () => {
    const empty = makeClient()
    expect(getCachedSessionUserId(empty)).toBeNull()

    const signedOut = makeClient()
    signedOut.setQueryData(orpc.session.queryOptions().queryKey, { user: null })
    expect(getCachedSessionUserId(signedOut)).toBeNull()
  })
})
