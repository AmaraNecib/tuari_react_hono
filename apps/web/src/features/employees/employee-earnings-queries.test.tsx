import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  earningsList: vi.fn(),
  earningsApprove: vi.fn(),
  payrollGet: vi.fn(),
  payrollCash: vi.fn(),
  payrollRepay: vi.fn(),
  payrollOffset: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      employeeEarningsList: mocks.earningsList,
      employeeEarningsApprove: mocks.earningsApprove,
      employeePayrollGet: mocks.payrollGet,
      employeePayrollCashRecord: mocks.payrollCash,
      employeePayrollAdvanceRepay: mocks.payrollRepay,
      employeePayrollAdvanceOffset: mocks.payrollOffset,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: mocks.session }))

import {
  employeeEarningsQueryKeys,
  useApproveEmployeeEarningMutation,
  useEmployeeEarningsQuery,
  useEmployeePayrollQuery,
  useRecordEmployeePayrollCashMutation,
  useRepayEmployeePayrollAdvanceMutation,
  useOffsetEmployeePayrollAdvanceMutation,
} from "./employee-earnings-queries"
import { useExactDebtSummary, useExactDebtDetail } from "@/features/debts/debts-exact-queries"
import { employeePayrollOutputSchema, employeeEarningSchema, exactDebtSummarySchema, exactDebtDetailSchema, type ExactDebtsClient } from "@tuari/contracts"
import { workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { orpc } from "@/lib/orpc-client"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: 1, retryDelay: 0 } } })
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

function payrollFixture(wagesOwed = "100.00") {
  return employeePayrollOutputSchema.parse({ employeeId: "employee-1", currency: "DZD", earnings: [], advances: [], cash: [], repayments: [], offsets: [], opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null }, summary: { approvedEarnings: wagesOwed, wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed, advancesGiven: "0.00", advancesCashRecovered: "0.00", advancesOffset: "0.00", advancesOwed: "0.00", unallocatedEarnings: "0.00", currentAppTotalsExcludeUnknownOpening: true } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
  mocks.earningsList.mockResolvedValue({ items: [] })
  mocks.earningsApprove.mockResolvedValue({ success: true, message: "ok", item: employeeEarningSchema.parse({ ...approval, id: "earning-1", referenceSalary: null, approvedAt: "2026-11-19T09:00:00.000Z", createdAt: "2026-11-19T09:00:00.000Z", actorUserId: null, transactionId: null }) })
  mocks.payrollGet.mockResolvedValue(payrollFixture())
  mocks.payrollCash.mockResolvedValue({ id: "cash-1" })
  mocks.payrollRepay.mockResolvedValue({ id: "repay-1" })
  mocks.payrollOffset.mockResolvedValue({ id: "offset-1" })
})

describe("employee earnings queries", () => {
  it("refetches a mounted fresh payroll cache on earning approval", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, { user: { id: "user-1", name: null, phone: "0612345678", version: "0.0.0" } })
    const payroll = renderHook(() => useEmployeePayrollQuery("employee-1"), { wrapper: wrapper(queryClient) })
    await waitFor(() => expect(payroll.result.current.data?.summary.wagesOwed).toBe("100.00"))
    mocks.payrollGet.mockResolvedValue(payrollFixture("200.00"))
    const approve = renderHook(() => useApproveEmployeeEarningMutation(), { wrapper: wrapper(queryClient) })
    await act(async () => { await approve.result.current.mutateAsync(approval) })
    await waitFor(() => expect(payroll.result.current.data?.summary.wagesOwed).toBe("200.00"))
    expect(mocks.payrollGet).toHaveBeenCalledTimes(2)
  })

  it.each(["cash", "repay", "offset"] as const)("refreshes active exact debt summary and detail after %s", async kind => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, { user: { id: "user-1", name: null, phone: "0612345678", version: "0.0.0" } })
    let balance = "100.00"
    const account = () => ({ id: "debt-1", partyType: "INTERNAL_WORKER", workerId: "employee-1", externalCounterpartyId: null, status: "OPEN", direction: "RECEIVABLE", currency: "DZD", currentBalance: balance, note: null, settledAt: null, actorUserId: null, actorLabel: null, transactionId: null, createdAt: "2026-11-19T09:00:00.000Z", updatedAt: "2026-11-19T09:00:00.000Z" })
    const client = { summary: vi.fn(async () => exactDebtSummarySchema.parse({ accounts: [account()], grossPayableDzd: "0.00", grossReceivableDzd: balance })), detail: vi.fn(async () => exactDebtDetailSchema.parse({ account: account(), entries: [] })) } as unknown as ExactDebtsClient
    const view = renderHook(() => ({ summary: useExactDebtSummary(client), detail: useExactDebtDetail(client, "debt-1") }), { wrapper: wrapper(queryClient) })
    await waitFor(() => expect(view.result.current.summary.data?.grossReceivableDzd).toBe("100.00"))
    await waitFor(() => expect(view.result.current.detail.data?.account.currentBalance).toBe("100.00"))
    const mutations = renderHook(() => ({ cash: useRecordEmployeePayrollCashMutation(), repay: useRepayEmployeePayrollAdvanceMutation(), offset: useOffsetEmployeePayrollAdvanceMutation() }), { wrapper: wrapper(queryClient) })
    balance = "80.00"
    const shared = { employeeId: "employee-1", requestId: "refresh-request", amount: "20.00" }
    await act(async () => {
      if (kind === "cash") await mutations.result.current.cash.mutateAsync({ ...shared, wages: [{ earningId: "earning-1", amount: "20.00" }], paymentDate: "2026-11-19T09:00:00.000Z" })
      else if (kind === "repay") await mutations.result.current.repay.mutateAsync({ ...shared, advanceId: "advance-1", paymentDate: "2026-11-19T09:00:00.000Z" })
      else await mutations.result.current.offset.mutateAsync({ ...shared, wageSource: { kind: "EARNING", id: "earning-1" }, advanceSource: { kind: "ADVANCE", id: "advance-1" }, settlementDate: "2026-11-19T09:00:00.000Z" })
    })
    await waitFor(() => expect(view.result.current.summary.data?.grossReceivableDzd).toBe("80.00"))
    await waitFor(() => expect(view.result.current.detail.data?.account.currentBalance).toBe("80.00"))
  })

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

  it("keys payroll data by the signed-in user and employee", async () => {
    const queryClient = makeQueryClient()
    renderHook(() => useEmployeePayrollQuery("employee-1"), { wrapper: wrapper(queryClient) })
    await waitFor(() => expect(mocks.payrollGet).toHaveBeenCalledWith({ employeeId: "employee-1" }))
    expect(queryClient.getQueryData(employeeEarningsQueryKeys.payroll("user-1", "employee-1"))).toEqual(payrollFixture())
  })

  it("sends each payroll command unchanged and invalidates payroll and debt views, not project cost", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, { user: { id: "user-1", name: null, phone: "0612345678", version: "0.0.0" } })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const inputs = {
      cash: { requestId: "cash-1", employeeId: "employee-1", amount: "12.00", paymentDate: "2026-11-19T09:00:00.000Z", wages: [{ earningId: "earning-1", amount: "12.00" }] },
      repay: { requestId: "repay-1", employeeId: "employee-1", advanceId: "advance-1", amount: "3.00", paymentDate: "2026-11-19T09:00:00.000Z" },
      offset: { requestId: "offset-1", employeeId: "employee-1", wageSource: { kind: "EARNING" as const, id: "earning-1" }, advanceSource: { kind: "ADVANCE" as const, id: "advance-1" }, amount: "2.00", settlementDate: "2026-11-19T09:00:00.000Z" },
    }
    const cash = renderHook(() => useRecordEmployeePayrollCashMutation(), { wrapper: wrapper(queryClient) })
    const repay = renderHook(() => useRepayEmployeePayrollAdvanceMutation(), { wrapper: wrapper(queryClient) })
    const offset = renderHook(() => useOffsetEmployeePayrollAdvanceMutation(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await cash.result.current.mutateAsync(inputs.cash)
      await repay.result.current.mutateAsync(inputs.repay)
      await offset.result.current.mutateAsync(inputs.offset)
    })

    expect(mocks.payrollCash).toHaveBeenCalledWith(inputs.cash)
    expect(mocks.payrollRepay).toHaveBeenCalledWith(inputs.repay)
    expect(mocks.payrollOffset).toHaveBeenCalledWith(inputs.offset)
    const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey)
    expect(keys).toContainEqual(employeeEarningsQueryKeys.payroll("user-1", "employee-1"))
    expect(keys).toContainEqual(employeeEarningsQueryKeys.root("user-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.debtsSummary("user-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.debtAccounts("user-1"))
    expect(keys).toContainEqual(workspaceQueryKeys.debtsDetail("user-1"))
    expect(keys).not.toContainEqual(workspaceQueryKeys.projectCost("user-1", "project-1"))
  })
})
