// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Expense } from "@tuari/contracts"

import { ExpenseFormDialog } from "./expense-form-dialog"

const { createMutateAsync, updateMutateAsync } = vi.hoisted(() => ({
  createMutateAsync: vi.fn(async () => ({})),
  updateMutateAsync: vi.fn(async () => ({})),
}))

vi.mock("./expenses-queries", () => ({
  useCreateExpenseMutation: () => ({ isPending: false, mutateAsync: createMutateAsync }),
  useUpdateExpenseMutation: () => ({ isPending: false, mutateAsync: updateMutateAsync }),
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
      stockItems={[{ id: "item-1", label: "خلاطة إسمنت" }]}
    />,
  )
}

describe("ExpenseFormDialog", () => {
  afterEach(() => {
    cleanup()
    createMutateAsync.mockClear()
    updateMutateAsync.mockClear()
  })

  it("prefills an existing expense's date in the picker's dd/MM/yyyy format", () => {
    renderDialog(EXPENSE)

    // The adapter turns the stored instant's Algeria day (2026-10-01) into the
    // value the shared DatePicker displays and round-trips.
    expect(screen.getByText("01/10/2026")).toBeTruthy()
  })

  it("submits the optional stock item the user selected", async () => {
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
        stockItems={[]}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "مصروف جديد" }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "مصروف جديد" })).toBeTruthy()
  })
})
