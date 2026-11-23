import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  entryCreate: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      employeeDebtEntryCreate: mocks.entryCreate,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.session,
}))

import { useCreateEmployeeDebtEntryMutation } from "./employee-debt-hooks"
import { orpc } from "@/lib/orpc-client"
import { workspaceQueryKeys } from "@/features/app-shell/workspace-keys"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

/**
 * The employee-debt write is a consumerless hook today, but its cache
 * invalidation is the seam the debts views depend on: creating an entry
 * changes the worker's ledger and the debts summary/detail. The single-account
 * read key it used to target was deleted with the dead EmployeeDebtPanel, so
 * this pins the domains it invalidates instead.
 */
describe("employee debt entry mutation — invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.entryCreate.mockResolvedValue({
      success: true,
      message: "تم تسجيل العملية.",
      item: { id: "entry-1" },
    })
  })

  it("invalidates the debts summary/detail and employees keys with the session user", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, {
      user: { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" },
    })
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useCreateEmployeeDebtEntryMutation(), {
      wrapper: wrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        employeeId: "employee-1",
        entryType: "ADVANCE",
        amountDzd: 200,
        note: null,
        entryDate: "2026-01-02T00:00:00.000Z",
      })
    })

    const invalidatedKeys = invalidateQueries.mock.calls.map(([arg]) => arg?.queryKey)
    expect(invalidatedKeys).toContainEqual(workspaceQueryKeys.debtsSummary("user-1"))
    expect(invalidatedKeys).toContainEqual(workspaceQueryKeys.debtsDetail("user-1"))
    expect(invalidatedKeys).toContainEqual(workspaceQueryKeys.employees("user-1"))
  })
})
