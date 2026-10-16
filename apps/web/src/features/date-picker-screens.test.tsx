// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { DebtCasesPanel } from "@/features/debts/debt-cases-panel"
import { DebtCreatePage } from "@/features/debts/debt-create-page"
import { getDebtAccountBalanceDisplay } from "@/features/debts/debt-utils"
import { DebtLedgerPanel } from "@/features/debts/debt-ledger-panel"
import { RecordPaymentDialog } from "@/features/debts/record-payment-dialog"
import { AddSalaryPaymentDialog } from "@/features/employees/add-salary-payment-dialog"
import { TransferItemDialog } from "@/features/inventory/transfer-item-dialog"

/**
 * Screen-level regression tests for issue #428: each screen whose date state is
 * the app's canonical `yyyy-MM-dd` day must submit that same canonical day after
 * the user picks a date. The shared DatePicker is the seam; these tests pin the
 * screen wiring on the SUBMITTED value, not the displayed text, because the
 * original bug was invisible in the display.
 */

const mocks = vi.hoisted(() => ({
  createDebtEntry: vi.fn(async () => ({})),
  settleDebtAccount: vi.fn(async () => ({})),
  createDebtAccount: vi.fn<(...args: unknown[]) => Promise<Record<string, never>>>(async () => ({})),
  createSalaryPayment: vi.fn(async () => ({})),
  transferAsset: vi.fn(async () => ({})),
  transferConsumable: vi.fn(async () => ({})),
}))

vi.mock("@tanstack/react-router", async (importActual) => {
  const actual = await importActual<typeof import("@tanstack/react-router")>()
  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  }
})

vi.mock("@/features/app-shell/workspace-mutations", async (importActual) => ({
  ...(await importActual<typeof import("@/features/app-shell/workspace-mutations")>()),
  useCreateDebtAccountMutation: () => ({ isPending: false, mutateAsync: mocks.createDebtAccount }),
  useCreateExternalCounterpartyMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateDebtEntryMutation: () => ({
    isPending: false,
    mutate: mocks.createDebtEntry,
    mutateAsync: mocks.createDebtEntry,
  }),
  useSettleDebtAccountMutation: () => ({
    isPending: false,
    mutate: mocks.settleDebtAccount,
    mutateAsync: mocks.settleDebtAccount,
  }),
  useCreateSalaryPaymentMutation: () => ({ isPending: false, mutateAsync: mocks.createSalaryPayment }),
  useRecordDebtPaymentMutation: () => ({ isPending: false, mutateAsync: vi.fn(), mutate: vi.fn() }),
  useVoidDebtEntryMutation: () => ({ isPending: false, mutateAsync: vi.fn(), mutate: vi.fn() }),
}))

vi.mock("@/features/inventory/inventory-hooks", async (importActual) => ({
  ...(await importActual<typeof import("@/features/inventory/inventory-hooks")>()),
  useTransferInventoryAssetMutation: () => ({ isPending: false, mutateAsync: mocks.transferAsset }),
  useTransferInventoryConsumableMutation: () => ({
    isPending: false,
    mutateAsync: mocks.transferConsumable,
  }),
  // The transfer dialog gained a default-charge query with the stock-charge
  // feature (#413). This file renders that dialog without a QueryClient, so the
  // query must be stubbed here the way the dialog's own test stubs it —
  // otherwise the screen throws "No QueryClient set" and the whole file fails.
  useAssetChargeDefaultQuery: () => ({ data: undefined, isFetching: false, isError: false }),
  useInventoryWarehousesQuery: () => ({ data: { items: [{ id: "w1", name: "مستودع" }] } }),
  useInventoryProjectsQuery: () => ({ data: { items: [{ id: "p1", name: "مشروع" }] } }),
}))

const TODAY_DAY = getAlgeriaDateInputValue()
// Pick a day that is never the form default (today), so the assertion proves
// the pick actually changed the submitted value on every run date.
const PICKED_DAY = `${TODAY_DAY.slice(0, 7)}-${TODAY_DAY.endsWith("-15") ? "16" : "15"}`
const PICKED_ISO = toAlgeriaDayBoundaryIso(PICKED_DAY, "start")

describe("date-picker screen fixtures (#428)", () => {
  it("picks a day that differs from the form default so a no-op pick cannot pass", () => {
    expect(PICKED_DAY).not.toBe(TODAY_DAY)
  })
})

const ACCOUNT: DebtAccount = {
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
}

/** Opens the nth DatePicker on screen and selects the 15th of the current month. */
function pickDate(index = 0) {
  const triggers = document.querySelectorAll<HTMLElement>('[data-slot="popover-trigger"]')
  const trigger = triggers[index]
  expect(trigger, `date picker #${index} not found`).toBeTruthy()
  fireEvent.click(trigger!)

  const cell = document.querySelector(`[data-day="${PICKED_DAY}"]`)
  expect(cell, `day ${PICKED_DAY} not found`).toBeTruthy()
  const button = cell?.querySelector("button") ?? (cell as HTMLElement)
  fireEvent.click(button)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe("TransferItemDialog submits the picked day for a transfer (#428)", () => {
  it("passes the canonical picked day as occurredAt", async () => {
    render(
      <TransferItemDialog
        open
        target={{ type: "ASSET", assetUnitId: "asset-1", assetName: "خلاطة" }}
        onOpenChange={vi.fn()}
      />,
    )

    const selects = document.querySelectorAll("select")
    fireEvent.change(selects[1]!, { target: { value: "w1" } })
    pickDate()
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))

    await waitFor(() => expect(mocks.transferAsset).toHaveBeenCalledTimes(1))
    expect(mocks.transferAsset).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: PICKED_ISO }),
    )
  })
})

describe("RecordPaymentDialog submits the picked day for a debt payment (#428)", () => {
  it("passes the canonical picked day as entryDate", async () => {
    render(
      <RecordPaymentDialog debtAccount={ACCOUNT} open onOpenChange={vi.fn()} />,
    )

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "100" } })
    pickDate()
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الدفعة" }))

    await waitFor(() => expect(mocks.createDebtEntry).toHaveBeenCalledTimes(1))
    expect(mocks.createDebtEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: PICKED_ISO }),
    )
  })
})

describe("AddSalaryPaymentDialog submits the picked day for a salary payment (#428)", () => {
  it("passes the canonical picked day as paymentDate", async () => {
    render(
      <AddSalaryPaymentDialog
        employeeId="employee-1"
        employeeName="عامل"
        salaryAmountDzd={30000}
        salaryPeriod="MONTHLY"
        open
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "100" } })
    pickDate()
    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة" }))

    await waitFor(() => expect(mocks.createSalaryPayment).toHaveBeenCalledTimes(1))
    expect(mocks.createSalaryPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentDate: PICKED_ISO }),
    )
  })
})

describe("DebtLedgerPanel submits the picked day for a ledger entry (#428)", () => {
  it("passes the canonical picked day as entryDate", async () => {
    const entries: DebtEntry[] = []
    render(<DebtLedgerPanel debtAccount={ACCOUNT} debtEntries={entries} title="حساب" />)

    fireEvent.change(screen.getByPlaceholderText("مثال: 2500 أو -2500"), {
      target: { value: "100" },
    })
    pickDate()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))

    await waitFor(() => expect(mocks.createDebtEntry).toHaveBeenCalledTimes(1))
    expect(mocks.createDebtEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: PICKED_ISO }),
    )
  })
})

describe("DebtCasesPanel submits the picked day as the opening entry date (#428)", () => {
  it("passes the canonical picked day as openingEntryDate", async () => {
    render(
      <DebtCasesPanel
        accounts={[]}
        debtEntriesByAccountId={{}}
        externalCounterpartyId="external-1"
        title="طرف"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("0 أو 2500"), {
      target: { value: "500" },
    })
    pickDate()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دين" }))

    await waitFor(() => expect(mocks.createDebtAccount).toHaveBeenCalledTimes(1))
    expect(mocks.createDebtAccount).toHaveBeenCalledWith(
      expect.objectContaining({ openingEntryDate: PICKED_ISO }),
    )
  })
})

describe("DebtCreatePage submits the picked day as the opening entry date (#428)", () => {
  it("passes the canonical picked day as openingEntryDate", async () => {
    render(
      <DebtCreatePage
        employees={[]}
        externalCounterparties={[]}
        navigation={{
          goToDebts: vi.fn(),
          goToEmployeeDebts: vi.fn(),
          goToExternalDetails: vi.fn(),
        } as never}
        preselectedWorkerId="worker-1"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "500" } })
    pickDate()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دين" }))

    await waitFor(() => expect(mocks.createDebtAccount).toHaveBeenCalledTimes(1))
    expect(mocks.createDebtAccount).toHaveBeenCalledWith(
      expect.objectContaining({ openingEntryDate: PICKED_ISO }),
    )
  })
})

describe("DebtCreatePage sends the chosen direction with a positive opening amount", () => {
  const renderCreatePage = () =>
    render(
      <DebtCreatePage
        employees={[]}
        externalCounterparties={[]}
        navigation={{
          goToDebts: vi.fn(),
          goToEmployeeDebts: vi.fn(),
          goToExternalDetails: vi.fn(),
        } as never}
        preselectedWorkerId="worker-1"
      />,
    )

  // OTHER is the unconstrained category, so the direction buttons render.
  const chooseOtherCategory = () => {
    fireEvent.click(screen.getByRole("button", { name: /أخرى/ }))
    fireEvent.change(screen.getByPlaceholderText("اذكر تفاصيل السبب"), {
      target: { value: "تفصيل السبب" },
    })
  }

  const submit = async () => {
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دين" }))
    await waitFor(() => expect(mocks.createDebtAccount).toHaveBeenCalledTimes(1))
    return mocks.createDebtAccount.mock.calls[0]![0] as {
      direction?: "PAYABLE" | "RECEIVABLE"
      openingBalanceDzd?: number
    }
  }

  it("owed-to-us sends RECEIVABLE with a positive amount, labelled مستحق لنا", async () => {
    renderCreatePage()
    chooseOtherCategory()
    fireEvent.click(screen.getByRole("button", { name: "مستحقات لنا" }))
    const args = await submit()

    expect(args.direction).toBe("RECEIVABLE")
    expect(args.openingBalanceDzd).toBe(500)
    // The create page always sends the direction, so this is the phrase the
    // resulting account renders.
    expect(
      getDebtAccountBalanceDisplay({
        currentBalance: args.openingBalanceDzd ?? 0,
        direction: args.direction ?? "PAYABLE",
      }).phrase,
    ).toBe("مستحق لنا")
  })

  it("owed-by-us sends PAYABLE with a positive amount, labelled مستحق علينا", async () => {
    renderCreatePage()
    chooseOtherCategory()
    fireEvent.click(screen.getByRole("button", { name: "مستحقات علينا" }))
    const args = await submit()

    expect(args.direction).toBe("PAYABLE")
    expect(args.openingBalanceDzd).toBe(500)
    expect(
      getDebtAccountBalanceDisplay({
        currentBalance: args.openingBalanceDzd ?? 0,
        direction: args.direction ?? "PAYABLE",
      }).phrase,
    ).toBe("مستحق علينا")
  })
})
