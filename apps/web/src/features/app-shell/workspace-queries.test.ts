import { beforeEach, describe, expect, it, vi } from "vitest"

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
}))

import { isRolesEndpointUnavailable } from "./workspace-queries"
import { useRolesQuery } from "./workspace-queries"

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
