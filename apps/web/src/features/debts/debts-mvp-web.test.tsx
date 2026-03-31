// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { DebtsHubPage } from "@/features/debts/debts-hub-page"
import { ExternalCounterpartyCreatePage } from "@/features/debts/external-counterparty-create-page"
import { ExternalCounterpartyDetailsPage } from "@/features/debts/external-counterparty-details-page"
import { EmployeeDetailsPage } from "@/features/employees/employee-details-page"

const {
  closeDebtAgainstMutate,
  createDebtAccountMutateAsync,
  createDebtEntryMutate,
  createCounterpartyMutateAsync,
  settleDebtAccountMutate,
} = vi.hoisted(() => ({
  closeDebtAgainstMutate: vi.fn(),
  createDebtAccountMutateAsync: vi.fn(async () => ({
    item: {
      actorLabel: null,
      actorUserId: null,
      createdAt: "2026-03-28T10:00:00.000Z",
      currentBalanceDzd: 0,
      externalCounterpartyId: "external-1",
      id: "debt-new",
      note: "حالة جديدة",
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
  useCloseDebtAgainstMutation: () => ({ isPending: false, mutate: closeDebtAgainstMutate }),
  useCreateDebtEntryMutation: () => ({ isPending: false, mutate: createDebtEntryMutate }),
  useSettleDebtAccountMutation: () => ({ isPending: false, mutate: settleDebtAccountMutate }),
  useCreateExternalCounterpartyMutation: () => ({
    isPending: false,
    mutateAsync: createCounterpartyMutateAsync,
  }),
  useCreateSalaryPaymentMutation: () => ({ isPending: false, mutate: vi.fn() }),
}))

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
            caseCount: 2,
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
        onCreateExternalCounterparty={vi.fn()}
        onOpenExternalCounterparty={vi.fn()}
        onOpenWorker={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "مركز الديون" })).toBeTruthy()
    expect(screen.getAllByText("لنا عنده").length).toBeGreaterThan(0)
    expect(screen.getAllByText("علينا له").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\+1500/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/-700/).length).toBeGreaterThan(0)
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

  it("supports multiple debt cases on external counterparty detail page", async () => {
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
            currentBalanceDzd: -700,
            externalCounterpartyId: "external-1",
            id: "debt-2",
            note: "توريد مارس",
            partyType: "EXTERNAL_COUNTERPARTY",
            settledAt: null,
            status: "OPEN",
            transactionId: null,
            updatedAt: "2026-03-27T10:00:00.000Z",
            workerId: null,
          },
          {
            actorLabel: null,
            actorUserId: null,
            createdAt: "2026-03-20T10:00:00.000Z",
            currentBalanceDzd: 300,
            externalCounterpartyId: "external-1",
            id: "debt-3",
            note: "ملف قديم",
            partyType: "EXTERNAL_COUNTERPARTY",
            settledAt: "2026-03-24T10:00:00.000Z",
            status: "SETTLED",
            transactionId: null,
            updatedAt: "2026-03-24T10:00:00.000Z",
            workerId: null,
          },
        ]}
        debtClosureLinksByAccountId={{
          "debt-2": [
            {
              actorLabel: null,
              actorUserId: null,
              closedAmountDzd: 200,
              createdAt: "2026-03-29T10:00:00.000Z",
              entryDate: "2026-03-29T10:00:00.000Z",
              id: "closure-1",
              note: "إغلاق جزئي سابق",
              sourceDebtAccountId: "debt-2",
              targetDebtAccountId: "debt-3",
              transactionId: null,
              updatedAt: "2026-03-29T10:00:00.000Z",
            },
          ],
          "debt-3": [
            {
              actorLabel: null,
              actorUserId: null,
              closedAmountDzd: 200,
              createdAt: "2026-03-29T10:00:00.000Z",
              entryDate: "2026-03-29T10:00:00.000Z",
              id: "closure-1",
              note: "إغلاق جزئي سابق",
              sourceDebtAccountId: "debt-2",
              targetDebtAccountId: "debt-3",
              transactionId: null,
              updatedAt: "2026-03-29T10:00:00.000Z",
            },
          ],
        }}
        debtEntriesByAccountId={{ "debt-2": [], "debt-3": [] }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("مثال: 2500 أو -2500"), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ القيد" }))

    expect(createDebtEntryMutate).toHaveBeenCalledWith(
      expect.objectContaining({ debtAccountId: "debt-2", signedAmountDzd: 500 }),
    )

    fireEvent.click(screen.getByRole("button", { name: "تسوية إلى صفر" }))

    expect(settleDebtAccountMutate).toHaveBeenCalledWith(
      expect.objectContaining({ debtAccountId: "debt-2" }),
    )

    expect(screen.getByText("سجل الإغلاق")).toBeTruthy()
    expect(screen.getByText(/إغلاق جزئي سابق/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText("تاريخ الإغلاق"), { target: { value: "2026-03-30" } })
    fireEvent.change(screen.getByLabelText("ملاحظة الإغلاق"), { target: { value: "إغلاق رصيدين متعاكسين" } })
    fireEvent.change(screen.getByLabelText("الحالة المقابلة"), { target: { value: "debt-3" } })
    fireEvent.click(screen.getByRole("button", { name: "إغلاق مقابل الحالة المختارة" }))

    expect(closeDebtAgainstMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        note: "إغلاق رصيدين متعاكسين",
        sourceDebtAccountId: "debt-2",
        targetDebtAccountId: "debt-3",
      }),
    )

    fireEvent.change(screen.getByPlaceholderText("0 أو 2500 أو -2500"), { target: { value: "-1200" } })
    fireEvent.change(screen.getByPlaceholderText("مثال: سلفة مواد، تسوية نقل، حساب مستقل"), { target: { value: "حالة شحن جديدة" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ حالة الدين" }))

    await waitFor(() => {
      expect(createDebtAccountMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ externalCounterpartyId: "external-1", openingBalanceDzd: -1200 }),
      )
    })
  })

  it("renders worker debt tab on employee detail page", () => {
    render(
      <EmployeeDetailsPage
        activeTab="debts"
        debtAccounts={[
          {
            actorLabel: null,
            actorUserId: null,
            createdAt: "2026-03-27T10:00:00.000Z",
            currentBalanceDzd: 300,
            externalCounterpartyId: null,
            id: "debt-worker-1",
            note: "رصيد موقع أ",
            partyType: "INTERNAL_WORKER",
            settledAt: null,
            status: "OPEN",
            transactionId: null,
            updatedAt: "2026-03-27T10:00:00.000Z",
            workerId: "worker-1",
          },
        ]}
        debtClosureLinksByAccountId={{ "debt-worker-1": [] }}
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

    expect(screen.getByRole("tab", { name: "الديون" })).toBeTruthy()
    expect(screen.getByText("ديون العامل")).toBeTruthy()
    expect(screen.getAllByText("رصيد افتتاحي").length).toBeGreaterThan(0)
  })
})
