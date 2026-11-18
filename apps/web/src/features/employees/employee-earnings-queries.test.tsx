import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  earningsList: vi.fn(),
  earningsApprove: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      employeeEarningsList: mocks.earningsList,
      employeeEarningsApprove: mocks.earningsApprove,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: mocks.session }))

import {
  employeeEarningsQueryKeys,
  useApproveEmployeeEarningMutation,
  useEmployeeEarningsQuery,
} from "./employee-earnings-queries"
import { workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { orpc } from "@/lib/orpc-client"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 0 } } })
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const approval = {
  employeeId: "employee-1",
  requestId: "f8db9f4e-f765-4d28-8ca3-c95059fcf421",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-02-01T00:00:00.000Z",
  currencyCode: "DZD" as const,
  totalAmount: "1200.01",
  unallocatedAmount: "200.01",
  segments: [
    { id: "segment-b", projectId: "project-2", days: 4, amount: "500.00" },
    { id: "segment-a", projectId: "project-1", days: 4, amount: "500.00" },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
  mocks.earningsList.mockResolvedValue({ items: [] })
  mocks.earningsApprove.mockResolvedValue({ success: true, message: "ok", item: { id: "earning-1", employeeId: "employee-1", segments: approval.segments } })
})

describe("employee earnings queries", () => {
  it("gates list RPCs on a resolved authenticated session and keys by user and employee", async () => {
    const queryClient = makeQueryClient()
    mocks.session.mockReturnValue({ data: undefined })
    const { rerender } = renderHook(() => useEmployeeEarningsQuery("employee-1"), { wrapper: wrapper(queryClient) })
    expect(mocks.earningsList).not.toHaveBeenCalled()

    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
    rerender()
    await waitFor(() => expect(mocks.earningsList).toHaveBeenCalledWith({ employeeId: "employee-1" }))
    expect(queryClient.getQueryData(employeeEarningsQueryKeys.list("user-1", "employee-1"))).toEqual({ items: [] })

    mocks.session.mockReturnValue({ data: { user: { id: "user-2" } } })
    rerender()
    await waitFor(() => expect(mocks.earningsList).toHaveBeenCalledTimes(2))
    expect(queryClient.getQueryData(employeeEarningsQueryKeys.list("user-2", "employee-1"))).toEqual({ items: [] })
  })

  it("sends exact DZD strings and segment order, reusing caller requestId on retry", async () => {
    const queryClient = makeQueryClient()
    mocks.earningsApprove.mockRejectedValueOnce(new Error("transient"))
    const { result } = renderHook(() => useApproveEmployeeEarningMutation(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync(approval)
    })

    expect(mocks.earningsApprove).toHaveBeenCalledTimes(2)
    expect(mocks.earningsApprove.mock.calls.map(([input]) => input)).toEqual([approval, approval])
  })

  it("invalidates only the active user's earnings, employees, and touched project costs", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, { user: { id: "user-1", name: null, phone: "0612345678", version: "0.0.0" } })
    queryClient.setQueryData(workspaceQueryKeys.workspaceSnapshot("user-1"), { snapshot: true })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useApproveEmployeeEarningMutation(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync(approval)
    })

    const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey)
    expect(keys).toContainEqual(employeeEarningsQueryKeys.root("user-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.employees("user-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.workspaceSnapshot("user-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.projectCost("user-1", "project-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.projectCost("user-1", "project-2"))
    expect(keys).not.toContainEqual(workspaceQueryKeys.projectCost("user-2", "project-1"))
  })
})
