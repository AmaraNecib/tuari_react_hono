// @vitest-environment jsdom

import "@/i18n"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({ session: vi.fn(), earningsList: vi.fn() }))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return { ...actual, rpcClient: { ...actual.rpcClient, employeeEarningsList: mocks.earningsList } }
})
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: mocks.session }))

import { EmployeeEarningsHistory } from "./employee-earnings-history"

afterEach(cleanup)

function renderHistory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return render(<EmployeeEarningsHistory employeeId="employee-1" />, { wrapper: Wrapper })
}

const earning = {
  id: "earning-1",
  employeeId: "employee-1",
  periodStart: "2026-03-01T00:00:00.000Z",
  periodEnd: "2026-03-31T23:59:59.999Z",
  currencyCode: "DZD" as const,
  totalAmount: "62500.00",
  unallocatedAmount: "0.00",
  referenceSalary: { period: "MONTHLY" as const, amount: "50000.00" },
  segments: [
    { id: "segment-a-1", projectId: "project-a", days: 5, amount: "10000.00" },
    { id: "segment-b", projectId: "project-b", days: 15, amount: "37500.00" },
    { id: "segment-a-2", projectId: "project-a", days: 5, amount: "15000.00" },
  ],
  approvedAt: "2026-04-01T09:00:00.000Z",
  actorUserId: "user-1",
  transactionId: "transaction-1",
  createdAt: "2026-04-01T09:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
  mocks.earningsList.mockResolvedValue({ items: [earning] })
})

describe("EmployeeEarningsHistory", () => {
  it("renders approved exact totals and keeps repeated project segments separate and ordered", async () => {
    renderHistory()

    const table = await screen.findByRole("table", { name: "سجل الأجور المعتمدة" })
    await waitFor(() => expect(mocks.earningsList).toHaveBeenCalledWith({ employeeId: "employee-1" }))
    const row = within(table).getByRole("row", { name: /62,?500/ })

    expect(within(row).getByText(/62,?500/)).toBeTruthy()
    const cells = within(row).getAllByRole("cell")
    expect(cells[2]?.textContent).toMatch(/\b0(?:\.00)?\b/)
    expect(within(row).getAllByText("project-a")).toHaveLength(2)
    expect(within(row).getByText("project-b")).toBeTruthy()
    const segmentList = within(row).getByRole("list")
    const entries = within(segmentList).getAllByRole("listitem")
    expect(entries).toHaveLength(3)
    expect(within(entries[0]!).getByText("project-a")).toBeTruthy()
    expect(entries[0]?.textContent).toMatch(/10,?000/)
    expect(within(entries[1]!).getByText("project-b")).toBeTruthy()
    expect(entries[1]?.textContent).toMatch(/37,?500/)
    expect(within(entries[2]!).getByText("project-a")).toBeTruthy()
    expect(entries[2]?.textContent).toMatch(/15,?000/)
    expect(within(row).getByText("المبلغ غير الموزع بالدينار الجزائري")).toBeTruthy()
    expect(within(row).queryByText(/50,?000/)).toBeNull()
    expect(mocks.earningsList).toHaveBeenCalledTimes(1)
  })
})
