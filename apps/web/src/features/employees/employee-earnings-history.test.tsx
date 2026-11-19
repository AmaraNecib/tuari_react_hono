// @vitest-environment jsdom

import "@/i18n"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({ session: vi.fn(), earningsList: vi.fn() }))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return { ...actual, rpcClient: { ...actual.rpcClient, employeeEarningsList: mocks.earningsList } }
})
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: mocks.session }))

import { EmployeeEarningsHistory } from "./employee-earnings-history"
import { SalariesSection } from "@/features/app-shell/salaries-section"

afterEach(cleanup)

function renderHistory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return render(
    <EmployeeEarningsHistory
      employeeNames={{ "employee-1": "عامل الرواتب" }}
      projectNames={{ "project-a": "مشروع ألف", "project-b": "مشروع باء" }}
    />,
    { wrapper: Wrapper },
  )
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
  it("renders employee and project names in salary history while preserving exact ordered segments", async () => {
    renderHistory()

    const table = await screen.findByRole("table", { name: "سجل الأجور المعتمدة" })
    await waitFor(() => expect(mocks.earningsList).toHaveBeenCalledWith(undefined))
    const row = within(table).getByRole("row", { name: /62,?500/ })

    expect(within(row).getByText(/62,?500/)).toBeTruthy()
    const cells = within(row).getAllByRole("cell")
    expect(cells[3]?.textContent).toMatch(/\b0(?:\.00)?\b/)
    expect(within(row).getByText("عامل الرواتب")).toBeTruthy()
    expect(within(row).getAllByText("مشروع ألف")).toHaveLength(2)
    expect(within(row).getByText("مشروع باء")).toBeTruthy()
    expect(within(row).queryByText("employee-1")).toBeNull()
    expect(within(row).queryByText("project-a")).toBeNull()
    const segmentList = within(row).getByRole("list")
    const entries = within(segmentList).getAllByRole("listitem")
    expect(entries).toHaveLength(3)
    expect(within(entries[0]!).getByText("مشروع ألف")).toBeTruthy()
    expect(entries[0]?.textContent).toMatch(/10,?000/)
    expect(within(entries[1]!).getByText("مشروع باء")).toBeTruthy()
    expect(entries[1]?.textContent).toMatch(/37,?500/)
    expect(within(entries[2]!).getByText("مشروع ألف")).toBeTruthy()
    expect(entries[2]?.textContent).toMatch(/15,?000/)
    expect(within(table).getByRole("columnheader", { name: "دون مشروع" })).toBeTruthy()
    expect(within(row).queryByText("دون مشروع")).toBeNull()
    expect(within(row).queryByText("المبلغ غير الموزع بالدينار الجزائري")).toBeNull()
    expect(within(row).queryByText(/50,?000/)).toBeNull()
    expect(screen.queryByText("ما الذي يسجله هذا السجل؟")).toBeNull()
    expect(screen.queryByText("يعرض السجل الأجور المكتسبة المعتمدة، ولا يثبت دفعًا نقديًا.")).toBeNull()
    expect(mocks.earningsList).toHaveBeenCalledTimes(1)
  })

  it("passes existing salary-worker and project labels into the history view", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SalariesSection
          employees={[{ id: "employee-1", name: "عامل الرواتب" }]}
          onEditSalary={vi.fn()}
          projects={[{ id: "project-a", name: "مشروع ألف" }, { id: "project-b", name: "مشروع باء" }]}
          recentPayments={[]}
          workers={[{
            employeeId: "employee-1",
            employeeName: "عامل الرواتب",
            employeePhone: "0555000001",
            employeeRole: "عامل",
            salaryReference: { period: "MONTHLY", amount: "50000.00" },
            lastPaymentDate: null,
            projectAssignments: [],
          }]}
        />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole("tab", { name: "سجل الأجور المعتمدة" }))
    const table = await screen.findByRole("table", { name: "سجل الأجور المعتمدة" })
    const row = within(table).getByRole("row", { name: /62,?500/ })
    expect(within(row).getByText("عامل الرواتب")).toBeTruthy()
    expect(within(row).getAllByText("مشروع ألف")).toHaveLength(2)
    expect(within(row).getByText("مشروع باء")).toBeTruthy()
    expect(within(row).queryByText("employee-1")).toBeNull()
    expect(within(row).queryByText("project-a")).toBeNull()
  })
})
