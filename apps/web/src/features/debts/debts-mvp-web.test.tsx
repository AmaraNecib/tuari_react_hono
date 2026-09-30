// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { DebtsHubPage } from "@/features/debts/debts-hub-page"
import { DebtLedgerPanel } from "@/features/debts/debt-ledger-panel"
import { DebtPartySummaryCard } from "@/features/debts/debt-party-summary-card"
import { ExternalCounterpartyCreatePage } from "@/features/externals/external-create-page"
import { ExternalCounterpartyDetailsPage } from "@/features/externals/external-details-page"
import { EmployeeDetailsPage } from "@/features/employees/employee-details-page"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

const {
  createDebtAccountMutateAsync,
  createDebtEntryMutate,
  createCounterpartyMutateAsync,
  settleDebtAccountMutate,
  createSalaryPaymentMutate,
} = vi.hoisted(() => ({
  createDebtAccountMutateAsync: vi.fn(async () => ({
    item: {
      actorLabel: null,
      actorUserId: null,
      createdAt: "2026-03-28T10:00:00.000Z",
      currentBalance: 0,
      externalCounterpartyId: "external-1",
      id: "debt-new",
      note: "حساب موحد",
      partyType: "EXTERNAL_COUNTERPARTY",
      settledAt: null,
      status: "SETTLED",
      transactionId: null,
      updatedAt: "2026-03-28T10:00:00.000Z",
      workerId: null,
    },
  })),
  createCounterpartyMutateAsync: vi.fn(async () => ({ item: { id: "external-2" } })),
  createDebtEntryMutate: vi.fn(),
  settleDebtAccountMutate: vi.fn(),
  createSalaryPaymentMutate: vi.fn(),
}))

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")

  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  }
})

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  useCreateDebtAccountMutation: () => ({ isPending: false, mutateAsync: createDebtAccountMutateAsync }),
  useCreateDebtEntryMutation: () => ({ isPending: false, mutate: createDebtEntryMutate }),
  useSettleDebtAccountMutation: () => ({ isPending: false, mutate: settleDebtAccountMutate }),
  useCreateExternalCounterpartyMutation: () => ({
    isPending: false,
    mutateAsync: createCounterpartyMutateAsync,
  }),
  useCreateSalaryPaymentMutation: () => ({ isPending: false, mutate: createSalaryPaymentMutate, reset: vi.fn() }),
  useRecordDebtPaymentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVoidDebtEntryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("debts MVP web UI", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders hub balances with correct sign semantics", () => {
    render(
      <DebtsHubPage
        rows={[
          {
            accountId: "debt-1",
            balanceDzd: 1500,
            caseCount: 1,
            name: "علي بن حميد",
            partyId: "worker-1",
            phone: "0555200120",
            status: "OPEN",
            type: "worker",
          },
          {
            accountId: "debt-2",
            balanceDzd: -700,
            caseCount: 1,
            name: "شركة المورد",
            partyId: "external-1",
            phone: "0555000000",
            status: "OPEN",
            type: "external",
          },
        ]}
        totals={{ openCount: 2, owedByUsDzd: 700, owedToUsDzd: 1500 }}
        onCreateDebt={vi.fn()}
        onOpenExternalCounterparty={vi.fn()}
        onOpenWorker={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "مركز الديون" })).toBeTruthy()
    // Positive net (1500) reads "مستحق لنا"; negative net (-700) reads
    // "مستحق علينا". Both amounts render positive.
    expect(screen.getAllByText("مستحق لنا").length).toBeGreaterThan(0)
    expect(screen.getAllByText("مستحق علينا").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1,500/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/700/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/-700/)).toBeNull()
  })

  it("submits external counterparty creation from dedicated page", async () => {
    const onCreated = vi.fn()

    render(<ExternalCounterpartyCreatePage onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "مورد جديد" } })
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: "0555123456" } })
    fireEvent.change(screen.getByLabelText("ملاحظة"), { target: { value: "ملاحظة اختبار" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ الطرف الخارجي" }))

    await waitFor(() => {
      expect(createCounterpartyMutateAsync).toHaveBeenCalledWith({
        fullName: "مورد جديد",
        note: "ملاحظة اختبار",
        phoneNumber: "0555123456",
      })
      expect(onCreated).toHaveBeenCalledWith("external-2")
    })
  })

  it("manages a unified external counterparty debt account", async () => {
    render(
      <ExternalCounterpartyDetailsPage
        counterparty={{
          createdAt: "2026-03-27T10:00:00.000Z",
          fullName: "شركة المورد",
          id: "external-1",
          note: null,
          phoneNumber: "0555000000",
          updatedAt: "2026-03-27T10:00:00.000Z",
        }}
        debtAccounts={[
          {
            actorLabel: null,
            actorUserId: null,
            createdAt: "2026-03-27T10:00:00.000Z",
            currentBalance: -700,
            externalCounterpartyId: "external-1",
            id: "debt-2",
            note: "حساب موحد",
            direction: "PAYABLE",
            partyType: "EXTERNAL_COUNTERPARTY",
            settledAt: null,
            status: "OPEN",
            transactionId: null,
            updatedAt: "2026-03-27T10:00:00.000Z",
            workerId: null,
          },
        ]}
        debtEntriesByAccountId={{ "debt-2": [] }}
      />,
    )

    // PAYABLE -700 means we overpaid, so the credit is ours.
    expect(screen.getAllByText("رصيد مستحق لنا").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/700/).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByPlaceholderText("مثال: 2500 أو -2500"), { target: { value: "500" } })
    fireEvent.click(screen.getAllByRole("button", { name: "تسجيل دفعة" })[1]!)

    expect(createDebtEntryMutate).toHaveBeenCalledWith(
      expect.objectContaining({ debtAccountId: "debt-2", signedAmountDzd: 500 }),
    )

    fireEvent.click(screen.getByRole("button", { name: "تسوية إلى صفر" }))

    expect(settleDebtAccountMutate).toHaveBeenCalledWith(
      expect.objectContaining({ debtAccountId: "debt-2" }),
    )

    fireEvent.change(screen.getByPlaceholderText("0 أو 2500 أو -2500"), { target: { value: "-1200" } })
    fireEvent.change(screen.getByPlaceholderText("مثال: دين جديد، دفعة وصلت، دفعة خرجت"), { target: { value: "دفعة شراء جديدة" } })
    fireEvent.click(screen.getAllByRole("button", { name: "تسجيل دفعة" })[0]!)

    await waitFor(() => {
      expect(createDebtAccountMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ externalCounterpartyId: "external-1", openingBalanceDzd: -1200 }),
      )
    })
  })

  it("renders worker debt tab on employee detail page", () => {
    renderWithProviders(
      <EmployeeDetailsPage
        activeTab="debts"
        debtAccounts={[
          {
            actorLabel: null,
            actorUserId: null,
            createdAt: "2026-03-27T10:00:00.000Z",
            currentBalance: 300,
            externalCounterpartyId: null,
            id: "debt-worker-1",
            note: "حساب العامل",
            direction: "PAYABLE",
            partyType: "INTERNAL_WORKER",
            settledAt: null,
            status: "OPEN",
            transactionId: null,
            updatedAt: "2026-03-27T10:00:00.000Z",
            workerId: "worker-1",
          },
        ]}
        debtEntriesByAccountId={{
          "debt-worker-1": [
            {
              actorLabel: null,
              actorUserId: null,
              balanceAfterDzd: 300,
              createdAt: "2026-03-27T10:00:00.000Z",
              debtAccountId: "debt-worker-1",
              entryDate: "2026-03-27T10:00:00.000Z",
              entryType: "OPENING",
              id: "entry-1",
              note: "رصيد افتتاحي",
              signedAmountDzd: 300,
              transactionId: null,
              updatedAt: "2026-03-27T10:00:00.000Z",
              reasonCategory: "INVOICE_DRIVEN",
              reasonDetail: null,
              paymentMethod: null,
              status: "LIVE",
              voidedAt: null,
              voidedBy: null,
              voidReason: null,
            },
          ],
        }}
        employee={{
          canDelete: false,
          canLeave: false,
          createdAt: "2026-03-27T10:00:00.000Z",
          currentManagerId: "manager-1",
          currentProjectAssignmentId: null,
          currentProjectId: null,
          currentWarehouseAssignmentId: null,
          currentWarehouseId: null,
          currentWorkplace: "بدون مشروع نشط",
          deleteDisabledReason: null,
          firstName: "علي",
          id: "worker-1",
          isWorker: true,
          lastName: "بن حميد",
          leaveDisabledReason: null,
          managerAssignmentId: "manager-assignment-1",
          managerName: "أحمد بلخير",
          name: "علي بن حميد",
          notes: null,
          occupation: "عامل بناء",
          phone: "0555200120",
          role: "عامل",
          roleId: "role-worker",
          roleKey: "worker",
          salaryAmountDzd: 4500,
          salaryPeriod: "DAILY",
          status: "ACTIVE",
          updatedAt: "2026-03-27T10:00:00.000Z",
        }}
        managedProjects={[]}
        managedWarehouses={[]}
        onTabChange={vi.fn()}
        salaryPayments={[]}
        workHistory={[]}
      />,
    )

    expect(screen.getByText(/ديون العامل/)).toBeTruthy()
    expect(screen.getAllByText("رصيد افتتاحي").length).toBeGreaterThan(0)
    // A positive PAYABLE account reads "مستحق علينا" with a positive amount.
    expect(screen.getAllByText("مستحق علينا").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0)
  })

  it("submits a picked payment date (not the form default) as a canonical ISO instant on the employee finance tab (#428)", async () => {
    // Pick a day that is NOT the form's default (today) so the assertion
    // proves the pick changed the submitted value, instead of matching the
    // default that was already in state (round-2 review finding).
    const today = getAlgeriaDateInputValue()
    const pickedDay = `${today.slice(0, 7)}-${today.endsWith("-15") ? "16" : "15"}`
    const expectedIso = toAlgeriaDayBoundaryIso(pickedDay, "start")
    expect(expectedIso).not.toBe(toAlgeriaDayBoundaryIso(today, "start"))

    renderWithProviders(
      <EmployeeDetailsPage
        activeTab="finance"
        debtAccounts={[]}
        debtEntriesByAccountId={{}}
        employee={{
          canDelete: false,
          canLeave: false,
          createdAt: "2026-03-27T10:00:00.000Z",
          currentManagerId: "manager-1",
          currentProjectAssignmentId: null,
          currentProjectId: null,
          currentWarehouseAssignmentId: null,
          currentWarehouseId: null,
          currentWorkplace: "بدون مشروع نشط",
          deleteDisabledReason: null,
          firstName: "علي",
          id: "worker-1",
          isWorker: true,
          lastName: "بن حميد",
          leaveDisabledReason: null,
          managerAssignmentId: "manager-assignment-1",
          managerName: "أحمد بلخير",
          name: "علي بن حميد",
          notes: null,
          occupation: "عامل بناء",
          phone: "0555200120",
          role: "عامل",
          roleId: "role-worker",
          roleKey: "worker",
          salaryAmountDzd: 4500,
          salaryPeriod: "DAILY",
          status: "ACTIVE",
          updatedAt: "2026-03-27T10:00:00.000Z",
        }}
        managedProjects={[]}
        managedWarehouses={[]}
        onTabChange={vi.fn()}
        salaryPayments={[]}
        workHistory={[]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "4500" } })

    const trigger = document.querySelector<HTMLElement>('[data-slot="popover-trigger"]')
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger!)
    const cell = document.querySelector(`[data-day="${pickedDay}"]`)
    expect(cell).not.toBeNull()
    fireEvent.click(cell!.querySelector("button")!)

    fireEvent.click(screen.getByRole("button", { name: "حفظ دفعة الراتب" }))

    await waitFor(() => expect(createSalaryPaymentMutate).toHaveBeenCalledTimes(1))
    expect(createSalaryPaymentMutate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentDate: expectedIso }),
    )
  })

  describe("debt balance terminology", () => {
    const makeAccount = (currentBalance: number, direction: "PAYABLE" | "RECEIVABLE") => ({
      actorLabel: null,
      actorUserId: null,
      createdAt: "2026-03-27T10:00:00.000Z",
      currentBalance,
      direction,
      externalCounterpartyId: "external-1",
      id: `debt-${direction}-${currentBalance}`,
      note: null,
      partyType: "EXTERNAL_COUNTERPARTY" as const,
      settledAt: null,
      status: "OPEN" as const,
      transactionId: null,
      updatedAt: "2026-03-27T10:00:00.000Z",
      workerId: null,
    })

    const renderLedger = (currentBalance: number, direction: "PAYABLE" | "RECEIVABLE") =>
      renderWithProviders(
        <DebtLedgerPanel debtAccount={makeAccount(currentBalance, direction)} debtEntries={[]} title="حساب" />,
      )

    it("states what we owe with a positive amount (PAYABLE +600)", () => {
      const { container } = renderLedger(600, "PAYABLE")
      expect(screen.getAllByText("مستحق علينا").length).toBeGreaterThan(0)
      expect(screen.getAllByText(/600/).length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain("-600")
    })

    it("states our credit when we overpaid with a positive amount (PAYABLE -50,000)", () => {
      const { container } = renderLedger(-50_000, "PAYABLE")
      expect(screen.getAllByText("رصيد مستحق لنا").length).toBeGreaterThan(0)
      expect(screen.getAllByText(/50,000/).length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain("-50,000")
      expect(container.textContent).not.toContain("-50000")
    })

    it("states what they owe with a positive amount (RECEIVABLE +600)", () => {
      const { container } = renderLedger(600, "RECEIVABLE")
      expect(screen.getAllByText("مستحق لنا").length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain("-600")
    })

    it("states their credit when they overpaid with a positive amount (RECEIVABLE -600)", () => {
      const { container } = renderLedger(-600, "RECEIVABLE")
      expect(screen.getAllByText("رصيد مستحق لهم").length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain("-600")
    })

    it("shows the settled phrase for a zero balance, not 'مستحق علينا 0'", () => {
      renderLedger(0, "PAYABLE")
      expect(screen.getAllByText("مسوّى").length).toBeGreaterThan(0)
      expect(screen.queryByText(/مستحق علينا 0/)).toBeNull()
    })

    it("labels a netted party balance without a signed number", () => {
      const { container } = renderWithProviders(
        <DebtPartySummaryCard
          accounts={[makeAccount(2000, "PAYABLE"), makeAccount(500, "RECEIVABLE")]}
          personName="شركة المورد"
        />,
      )
      // Net = 500 - 2000 = -1500: we owe them.
      expect(screen.getAllByText("مستحق علينا").length).toBeGreaterThan(0)
      expect(screen.getAllByText(/1,500/).length).toBeGreaterThan(0)
      expect(container.textContent).not.toContain("-1,500")
      expect(container.textContent).not.toContain("-1500")
    })
  })
})
