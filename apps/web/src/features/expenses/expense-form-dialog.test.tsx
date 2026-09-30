// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Expense } from "@tuari/contracts"

import { ExpenseFormDialog } from "./expense-form-dialog"

const { createMutateAsync, updateMutateAsync, optionsResult, definitionResult, optionsUsages } = vi.hoisted(() => ({
  createMutateAsync: vi.fn(async () => ({})),
  updateMutateAsync: vi.fn(async () => ({})),
  optionsResult: vi.fn(() => [] as Array<Record<string, unknown>>),
  definitionResult: vi.fn(() => ({ data: undefined }) as { data: unknown }),
  optionsUsages: [] as unknown[],
}))

vi.mock("./expenses-queries", () => ({
  useCreateExpenseMutation: () => ({ isPending: false, mutateAsync: createMutateAsync }),
  useUpdateExpenseMutation: () => ({ isPending: false, mutateAsync: updateMutateAsync }),
}))

vi.mock("@/features/inventory/inventory-hooks", () => ({
  useItemDefinitionOptionsQuery: (input: { usage: unknown }) => {
    optionsUsages.push(input.usage)
    return { options: optionsResult(), fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false }
  },
  useInventoryItemDefinitionQuery: () => definitionResult(),
}))

const EXPENSE: Expense = {
  id: "e-1",
  amount: 12500,
  // October 1 in Algeria; the raw UTC day is September 30.
  expenseDate: "2026-09-30T23:00:00.000Z",
  whatFor: "هاتف للورشة",
  responsibleWorkerId: null,
  sellerId: null,
  projectId: null,
  stockItemId: "item-1",
  note: null,
  status: "LIVE",
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  actorUserId: "user-1",
  actorLabel: "أمين",
  transactionId: null,
  createdAt: "2026-09-30T23:00:00.000Z",
  updatedAt: "2026-09-30T23:00:00.000Z",
}

function renderDialog(expense: Expense | null = null) {
  return render(
    <ExpenseFormDialog
      open
      onOpenChange={vi.fn()}
      expense={expense}
      projects={[]}
      employees={[]}
      sellers={[]}
    />,
  )
}

/** Item definitions the mocked STOCK_REFERENCE read can return. */
const ACTIVE_CONSUMABLE = { id: "def-consumable", name: "إسمنت", itemType: "CONSUMABLE", unit: "قطعة", description: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
const ACTIVE_ASSET = { id: "def-asset", name: "مثقاب", itemType: "ASSET", unit: null, description: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
const ARCHIVED_ASSET = { id: "def-archived", name: "خلاطة قديمة", itemType: "ASSET", unit: null, description: null, isActive: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }

describe("ExpenseFormDialog", () => {
  afterEach(() => {
    cleanup()
    createMutateAsync.mockClear()
    updateMutateAsync.mockClear()
    optionsResult.mockReset()
    optionsResult.mockReturnValue([])
    definitionResult.mockReset()
    definitionResult.mockReturnValue({ data: undefined })
    optionsUsages.length = 0
  })

  it("prefills an existing expense's date in the picker's dd/MM/yyyy format", () => {
    renderDialog(EXPENSE)

    // The picker displays the stored instant's Algeria day (2026-10-01) as
    // dd/MM/yyyy; the DatePicker value contract is canonical yyyy-MM-dd.
    expect(screen.getByText("01/10/2026")).toBeTruthy()
  })

  it("submits the optional stock item the user selected", async () => {
    optionsResult.mockReturnValue([{ id: "item-1", name: "خلاطة إسمنت", itemType: "ASSET", unit: null, description: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }])
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("قطعة المخزون المرتبطة (اختياري)"), {
      target: { value: "item-1" },
    })
    fireEvent.click(screen.getByRole("button", { name: "مصروف جديد" }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        stockItemId: "item-1",
      }),
    )
  })

  it("feeds the stock-item picker from the active-only STOCK_REFERENCE seam", () => {
    // The STOCK_REFERENCE usage is kind-agnostic but active-only: both kinds are
    // offerable, an archived definition is not. The server-side exclusion is
    // pinned by the API equivalence test; this pins the web wiring to that seam
    // instead of the old unpaged mapping that leaked archived definitions.
    optionsResult.mockReturnValue([ACTIVE_CONSUMABLE, ACTIVE_ASSET])
    renderDialog()

    const select = screen.getByLabelText("قطعة المخزون المرتبطة (اختياري)") as HTMLSelectElement
    const optionTexts = Array.from(select.options).map((option) => option.textContent)
    expect(optionTexts).toContain("إسمنت")
    expect(optionTexts).toContain("مثقاب")
    expect(optionTexts).not.toContain(ARCHIVED_ASSET.name)
    expect(optionsUsages).toContainEqual({ surface: "STOCK_REFERENCE" })
  })

  it("still displays an archived stock item the edited expense already references", async () => {
    definitionResult.mockReturnValue({ data: ARCHIVED_ASSET })
    renderDialog({ ...EXPENSE, stockItemId: ARCHIVED_ASSET.id })

    // The archived definition must not be OFFERED, but an existing reference
    // must not silently render blank either.
    await waitFor(() =>
      expect(screen.getByLabelText("قطعة المخزون المرتبطة (اختياري)").textContent).toContain(
        ARCHIVED_ASSET.name,
      ),
    )
  })

  it("submits the prefilled date as the Algeria start-of-day instant, not a dd/MM/yyyy string", async () => {
    renderDialog(EXPENSE)

    fireEvent.click(screen.getByRole("button", { name: "حفظ" }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1))
    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "e-1",
        expenseDate: "2026-09-30T23:00:00.000Z",
      }),
    )
  })

  it("keeps the dialog open and swallows a rejected submit", async () => {
    createMutateAsync.mockRejectedValueOnce(new Error("network down"))
    const onOpenChange = vi.fn()
    render(
      <ExpenseFormDialog
        open
        onOpenChange={onOpenChange}
        expense={null}
        projects={[]}
        employees={[]}
        sellers={[]}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "مصروف جديد" }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "مصروف جديد" })).toBeTruthy()
  })
})
