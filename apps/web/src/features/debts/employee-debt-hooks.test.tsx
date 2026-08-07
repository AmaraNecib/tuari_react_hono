import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  accountGet: vi.fn(),
  entryCreate: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      employeeDebtAccountGet: mocks.accountGet,
      employeeDebtEntryCreate: mocks.entryCreate,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.session,
}))

import {
  useCreateEmployeeDebtEntryMutation,
  useEmployeeDebtAccountQuery,
} from "./employee-debt-hooks"
import { orpc } from "@/lib/orpc-client"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const ACCOUNT_BEFORE = {
  id: "debt-account-1",
  partyType: "INTERNAL_WORKER",
  workerId: "employee-1",
  externalCounterpartyId: null,
  status: "OPEN",
  direction: "PAYABLE",
  currentBalance: 300,
  note: null,
  settledAt: null,
  actorUserId: "user-1",
  actorLabel: "مدير التشغيل",
  transactionId: "tx-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const

const ACCOUNT_AFTER = {
  ...ACCOUNT_BEFORE,
  currentBalance: 500,
  updatedAt: "2026-01-02T00:00:00.000Z",
} as const

/**
 * Integration test across the query-key seam (issue #236): the employee debt
 * account query (user-scoped `employeeDebtAccount` key) must refetch after
 * the create-entry mutation's null-safe invalidation, so a new entry's
 * balance is reflected without a manual refresh.
 */
describe("employee debt account — freshness after entry create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.accountGet.mockResolvedValue({ success: true, message: "ok", item: ACCOUNT_BEFORE })
    mocks.entryCreate.mockResolvedValue({
      success: true,
      message: "تم تسجيل العملية.",
      item: { id: "entry-1" },
    })
  })

  it("shows the updated account after the create-entry mutation resolves", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, {
      user: { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" },
    })

    const { result: accountResult } = renderHook(() => useEmployeeDebtAccountQuery("employee-1"), {
      wrapper: wrapper(queryClient),
    })
    const { result: mutationResult } = renderHook(() => useCreateEmployeeDebtEntryMutation(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(accountResult.current.data?.currentBalance).toBe(300))

    // Simulate the server-side update: the next fetch returns the new balance.
    mocks.accountGet.mockResolvedValue({ success: true, message: "ok", item: ACCOUNT_AFTER })

    await act(async () => {
      await mutationResult.current.mutateAsync({
        employeeId: "employee-1",
        entryType: "ADVANCE",
        amountDzd: 200,
        note: null,
        entryDate: "2026-01-02T00:00:00.000Z",
      })
    })

    await waitFor(() => expect(accountResult.current.data?.currentBalance).toBe(500))
    expect(accountResult.current.data?.id).toBe("debt-account-1")
  })
})
