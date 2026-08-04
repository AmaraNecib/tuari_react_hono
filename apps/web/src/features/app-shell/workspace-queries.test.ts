import { beforeEach, describe, expect, it, vi } from "vitest"
import { keepPreviousData } from "@tanstack/react-query"

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useSessionQuery: vi.fn(),
  rbacRolesList: vi.fn(),
  rolesList: vi.fn(),
}))

vi.mock("@tanstack/react-query", async () => ({
  ...(await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")),
  useQuery: mocks.useQuery,
}))

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.useSessionQuery,
}))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: {
    rbacRolesList: mocks.rbacRolesList,
    rolesList: mocks.rolesList,
  },
  // workspace-keys evaluates `sessionQueryKey` at module load from
  // `orpc.session.queryOptions().queryKey` — mirror the mounted key shape.
  orpc: {
    session: {
      queryOptions: () => ({ queryKey: [["session"], { type: "query" }] }),
    },
  },
}))

import { isRolesEndpointUnavailable, useRolesQuery, useWorkspaceScopedQuery } from "./workspace-queries"
import { workspaceQueryKeys } from "./workspace-keys"

const useRoleListQueryOptions = () => {
  useRolesQuery()
  return mocks.useQuery.mock.calls[0]?.[0] as {
    queryFn: () => Promise<{ items: unknown[] }>
  }
}

describe("isRolesEndpointUnavailable", () => {
  it("allows fallback for a missing endpoint", () => {
    expect(isRolesEndpointUnavailable({ code: "NOT_FOUND" })).toBe(true)
    expect(isRolesEndpointUnavailable({ code: "METHOD_NOT_SUPPORTED" })).toBe(true)
  })

  it("does not treat authorization or server errors as compatibility failures", () => {
    expect(isRolesEndpointUnavailable({ code: "FORBIDDEN" })).toBe(false)
    expect(isRolesEndpointUnavailable({ code: "INTERNAL_SERVER_ERROR" })).toBe(false)
    expect(isRolesEndpointUnavailable(new Error("network failure"))).toBe(false)
  })
})

describe("useRolesQuery compatibility fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
  })

  it("falls back only when the RBAC endpoint is unavailable", async () => {
    mocks.rbacRolesList.mockRejectedValue({ code: "NOT_FOUND" })
    mocks.rolesList.mockResolvedValue({ items: [{ id: "role-1", key: "viewer" }] })

    await expect(useRoleListQueryOptions().queryFn()).resolves.toEqual({
      items: [{ id: "role-1", key: "viewer", permissions: [] }],
    })
    expect(mocks.rolesList).toHaveBeenCalledOnce()
  })

  it("propagates permission failures instead of loading incomplete roles", async () => {
    const error = { code: "FORBIDDEN" }
    mocks.rbacRolesList.mockRejectedValue(error)

    await expect(useRoleListQueryOptions().queryFn()).rejects.toBe(error)
    expect(mocks.rolesList).not.toHaveBeenCalled()
  })
})

describe("useWorkspaceScopedQuery session gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
  })

  it("scopes the key with the session userId and enables the query", () => {
    useWorkspaceScopedQuery({
      key: workspaceQueryKeys.warehouses,
      queryFn: async () => ({ items: [] }),
    })

    const options = mocks.useQuery.mock.calls[0]?.[0]
    expect(options.queryKey).toEqual(["phase1", "workspace-domain", "warehouses", "user-1"])
    expect(options.enabled).toBe(true)
  })

  it("keeps the query disabled until the session resolves", () => {
    mocks.useSessionQuery.mockReturnValue({ data: undefined })

    useWorkspaceScopedQuery({
      key: workspaceQueryKeys.warehouses,
      queryFn: async () => ({ items: [] }),
    })

    const options = mocks.useQuery.mock.calls[0]?.[0]
    expect(options.enabled).toBe(false)
    expect(options.queryKey).toEqual(["phase1", "workspace-domain", "warehouses", null])
  })

  it("keeps the query disabled for a resolved signed-out session", () => {
    mocks.useSessionQuery.mockReturnValue({ data: { user: null } })

    useWorkspaceScopedQuery({
      key: workspaceQueryKeys.warehouses,
      queryFn: async () => ({ items: [] }),
    })

    expect(mocks.useQuery.mock.calls[0]?.[0].enabled).toBe(false)
  })

  it("ANDs the caller's enabled flag with the session gate", () => {
    useWorkspaceScopedQuery({
      key: workspaceQueryKeys.warehouses,
      queryFn: async () => ({ items: [] }),
      enabled: false,
    })

    expect(mocks.useQuery.mock.calls[0]?.[0].enabled).toBe(false)
  })

  it("passes additional useQuery options through (placeholderData)", () => {
    useWorkspaceScopedQuery({
      key: workspaceQueryKeys.employees,
      queryFn: async () => ({ items: [] }),
      placeholderData: keepPreviousData,
    })

    const options = mocks.useQuery.mock.calls[0]?.[0]
    expect(options.placeholderData).toBe(keepPreviousData)
  })
})
