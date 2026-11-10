// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ExactExpense, ExactExpensesClient } from "@tuari/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExactExpenseFormDialog } from "./expense-form-dialog"

const { create, update } = vi.hoisted(() => ({ create: vi.fn(async () => ({})), update: vi.fn(async () => ({})) }))
vi.mock("./expenses-exact-queries", () => ({
  useCreateExactExpenseMutation: () => ({ isPending: false, mutateAsync: create }),
  useUpdateExactExpenseMutation: () => ({ isPending: false, mutateAsync: update }),
}))
vi.mock("@/features/inventory/inventory-hooks", () => ({
  useItemDefinitionOptionsQuery: () => ({ options: [], fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false }),
  useInventoryItemDefinitionQuery: () => ({ data: undefined }),
}))
const client = {} as ExactExpensesClient
const expense: ExactExpense = {
  id: "e-1", amount: "90071992547409.93", currency: "DZD", expenseDate: "2026-09-30T23:00:00.000Z",
  whatFor: "فاتورة", responsibleWorkerId: null, sellerId: null, projectId: "p-1", stockItemId: null,
  note: "ملاحظة", status: "LIVE", voidedAt: null, voidedBy: null, voidReason: null,
  actorUserId: "u-1", actorLabel: "Operator", transactionId: null,
  createdAt: "2026-09-30T23:00:00.000Z", updatedAt: "2026-09-30T23:00:00.000Z",
}
function setup(edit: ExactExpense | null = null) {
  const onOpenChange = vi.fn()
  render(<ExactExpenseFormDialog open onOpenChange={onOpenChange} expense={edit} client={client} projects={[{ id: "p-1", label: "المشروع" }]} employees={[]} sellers={[]} />)
  return onOpenChange
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("opt-in exact expense form", () => {
  it.each([["90,071,992,547,409.93", "90071992547409.93"], ["٠٫١٠", "0.10"], ["0.20", "0.20"], ["92,233,720,368,547,758.07", "92233720368547758.07"]])("submits %s without a numeric bridge", async (draft, wire) => {
    setup()
    const input = screen.getByLabelText("المبلغ")
    fireEvent.change(input, { target: { value: draft } })
    expect((input as HTMLInputElement).value).toBe(draft)
    fireEvent.click(screen.getByRole("button", { name: "مصروف جديد" }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ amount: wire })))
  })
  it.each(["0", "-1", "0.001", "1e3", "1,23", "92233720368547758.08"])("rejects invalid expense %s", (draft) => {
    setup()
    fireEvent.change(screen.getByLabelText("المبلغ"), { target: { value: draft } })
    const submit = screen.getByRole("button", { name: "مصروف جديد" }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(submit)
    expect(create).not.toHaveBeenCalled()
  })
  it("prefills and corrects an exact amount without losing its last cent or Algeria day", async () => {
    setup(expense)
    expect((screen.getByLabelText("المبلغ") as HTMLInputElement).value).toBe("90071992547409.93")
    expect(screen.getByText("01/10/2026")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("سبب التعديل (اختياري)"), { target: { value: "تصحيح" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "e-1", amount: "90071992547409.93", expenseDate: "2026-09-30T23:00:00.000Z", projectId: "p-1", reason: "تصحيح" })))
  })
  it("retains amount, note and project when a correction fails", async () => {
    update.mockRejectedValueOnce(new Error("network down"))
    const onOpenChange = setup(expense)
    fireEvent.change(screen.getByLabelText("المبلغ"), { target: { value: "٠٫٢٠" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect((screen.getByLabelText("المبلغ") as HTMLInputElement).value).toBe("٠٫٢٠")
    expect((screen.getByLabelText("ملاحظات") as HTMLTextAreaElement).value).toBe("ملاحظة")
    expect(screen.getByText("المشروع")).toBeTruthy()
  })
})
