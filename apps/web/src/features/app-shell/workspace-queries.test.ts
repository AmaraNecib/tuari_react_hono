import { beforeEach, describe, expect, it, vi } from "vitest"
import { keepPreviousData } from "@tanstack/react-query"

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useSessionQuery: vi.fn(),
  rbacRolesList: vi.fn(),
  rolesList: vi.fn(),
  workspaceSnapshot: vi.fn(),
  employeesListPaged: vi.fn(),
  systemLogList: vi.fn(),
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
    workspaceSnapshot: mocks.workspaceSnapshot,
    employeesListPaged: mocks.employeesListPaged,
    systemLogList: mocks.systemLogList,
  },
  // workspace-keys evaluates `sessionQueryKey` at module load from
  // `orpc.session.queryOptions().queryKey` — mirror the mounted key shape.
  orpc: {
    session: {
      queryOptions: () => ({ queryKey: [["session"], { type: "query" }] }),
    },
  },
}))

import {
  demoWorkspaceQueryKey,
  isRolesEndpointUnavailable,
  useCompositeWorkspaceQuery,
  useEmployeesPagedQuery,
  useRolesQuery,
  useSystemLogQuery,
  useWorkspaceScopedQuery,
} from "./workspace-queries"
import { workspaceQueryKeys } from "./workspace-keys"

const useRoleListQueryOptions = () => {
  useRolesQuery()
  return mocks.useQuery.mock.calls[0]?.[0] as {
    queryFn: () => Promise<{ items: unknown[] }>
  }
}

describe("useEmployeesPagedQuery server-side search (issue #183)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
  })

  it("includes the search term in the query key and forwards it to the RPC", () => {
    useEmployeesPagedQuery({ search: "بن صالح", limit: 10 })

    const options = mocks.useQuery.mock.calls[0]?.[0] as {
      queryKey: readonly unknown[]
      queryFn: () => Promise<unknown>
    }
    expect(options.queryKey).toEqual([
      "phase1",
      "workspace-domain",
      "employees",
      "user-1",
      "paged",
      { cursor: undefined, limit: 10, status: undefined, roleId: undefined, search: "بن صالح" },
    ])

    void options.queryFn()
    expect(mocks.employeesListPaged).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 10,
      status: undefined,
      roleId: undefined,
      search: "بن صالح",
    })
  })

  it("treats an absent search as undefined so the key stays stable", () => {
    useEmployeesPagedQuery({ limit: 10 })

    const options = mocks.useQuery.mock.calls[0]?.[0] as { queryKey: readonly unknown[] }
    expect(options.queryKey).toEqual([
      "phase1",
      "workspace-domain",
      "employees",
      "user-1",
      "paged",
      { cursor: undefined, limit: 10, status: undefined, roleId: undefined, search: undefined },
    ])
  })
})

describe("useCompositeWorkspaceQuery — single workspaceSnapshot RPC (issue #276)", () => {
  const snapshotData = {
    roles: [],
    employees: [],
    externalCounterparties: [],
    debtAccounts: [],
    debtEntries: [],
    projects: [],
    warehouses: [],
    managerAssignments: [],
    projectAssignments: [],
    warehouseAssignments: [],
    employeeStateHistory: [],
    projectManagerOwnershipHistory: [],
    warehouseManagerOwnershipHistory: [],
    salaryPayments: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
    mocks.workspaceSnapshot.mockResolvedValue(snapshotData)
  })

  it("mounts one query that resolves the whole workspace from the snapshot RPC", async () => {
    useCompositeWorkspaceQuery()

    const options = mocks.useQuery.mock.calls[0]?.[0] as {
      queryKey: readonly unknown[]
      enabled: boolean
      queryFn: () => Promise<unknown>
    }
    expect(options.queryKey).toEqual(["phase1", "workspace", "user-1"])
    expect(options.enabled).toBe(true)

    await expect(options.queryFn()).resolves.toEqual(snapshotData)
    expect(mocks.workspaceSnapshot).toHaveBeenCalledTimes(1)
    // The composite must not fan out to the individual list endpoints anymore.
    expect(mocks.rbacRolesList).not.toHaveBeenCalled()
  })

  it("stays disabled until the session resolves", () => {
    mocks.useSessionQuery.mockReturnValue({ data: undefined })

    useCompositeWorkspaceQuery()

    const options = mocks.useQuery.mock.calls[0]?.[0] as { queryKey: readonly unknown[]; enabled: boolean }
    expect(options.queryKey).toEqual(["phase1", "workspace", null])
    expect(options.enabled).toBe(false)
  })

  it("aliases the demo workspace key to the vocabulary snapshot key", () => {
    expect(demoWorkspaceQueryKey("user-1")).toEqual(["phase1", "workspace", "user-1"])
    expect(demoWorkspaceQueryKey()).toEqual(["phase1", "workspace", "anonymous"])
  })
})

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

describe("useSystemLogQuery date range (#428 round 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
  })

  it("expands the picked days to inclusive Algeria bounds on the wire", async () => {
    useSystemLogQuery({ filters: { fromDate: "2026-10-01", toDate: "2026-10-15" } })

    const options = mocks.useQuery.mock.calls[0]?.[0] as { queryFn: () => Promise<unknown> }
    await options.queryFn()

    expect(mocks.systemLogList).toHaveBeenCalledWith({
      actionType: undefined,
      actorUserId: undefined,
      entityType: undefined,
      // 00:00 Africa/Algiers on the picked start day.…
      fromDate: "2026-09-30T23:00:00.000Z",
      // …and 23:59:59.999 on the picked end day, so the whole day is in range.
      toDate: "2026-10-15T22:59:59.999Z",
    })
  })

  it("sends no filter object when no filters are given", async () => {
    useSystemLogQuery()

    const options = mocks.useQuery.mock.calls[0]?.[0] as { queryFn: () => Promise<unknown> }
    await options.queryFn()

    expect(mocks.systemLogList).toHaveBeenCalledWith(undefined)
  })
})
