// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ExactExpenseListOutput, ExactExpensesClient } from "@tuari/contracts"
import { ExpensesPage, ExactExpensesPage } from "./expenses-page"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"

const { listQuery, detailQuery, voidMutate } = vi.hoisted(() => ({
  listQuery: vi.fn(),
  detailQuery: vi.fn(),
  voidMutate: vi.fn(),
}))

vi.mock("./expenses-exact-queries", () => ({
  useExactExpensesListQuery: (...args: unknown[]) => listQuery(...args),
  useExactExpenseQuery: (...args: unknown[]) => detailQuery(...args),
  useCreateExactExpenseMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateExactExpenseMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVoidExactExpenseMutation: () => ({ isPending: false, mutateAsync: voidMutate }),
}))

vi.mock("./expense-form-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./expense-form-dialog")>()
  return { ...actual, ExactExpenseFormDialog: () => null }
})

vi.mock("@/features/inventory/inventory-hooks", () => ({
  useItemDefinitionOptionsQuery: () => ({ options: [], fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false }),
  useInventoryItemDefinitionQuery: () => ({ data: undefined }),
}))

const exactExpense = {
  id: "expense-exact-1", amount: "90071992547409.13", currency: "DZD" as const,
  expenseDate: "2026-10-03T10:00:00.000Z", whatFor: "Exact expense", responsibleWorkerId: "worker-1",
  sellerId: null, projectId: "project-1", stockItemId: null, note: "Receipt note", status: "LIVE" as const,
  voidedAt: null, voidedBy: null, voidReason: null, actorUserId: "creator-1", actorLabel: "Creator",
  transactionId: "txn-1", createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z",
}

const exactData: ExactExpenseListOutput = {
  items: [exactExpense],
  totals: { total: "90071992547409.13", count: 1, taggedToProject: "90071992547409.13", notTaggedToProject: "0.00", heldByWorkers: "90071992547409.13", workerCount: 1 },
  groupsByProject: [{ projectId: "project-1", total: "90071992547409.13", count: 1 }],
}
const client = {} as ExactExpensesClient
const props = { projects: [{ id: "project-1", label: "Workshop" }], employees: [{ id: "worker-1", label: "Worker" }], sellers: [], client }
function renderExact() { return render(<ExactExpensesPage {...props} />) }

afterEach(() => {
  cleanup()
  listQuery.mockReset()
  detailQuery.mockReset()
  voidMutate.mockReset()
  setMoneyGrouping(true)
})

describe("ExactExpensesPage", () => {
  it("renders exact large fractional values in KPIs, groups, and rows without numeric coercion", () => {
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: false, isFetching: false, refetch: vi.fn() })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderExact()
    expect(screen.getAllByText(/90,071,992,547,409\.13/).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText("Exact expense")).toBeTruthy()
  })

  it("allows long exact group totals and actions to wrap without forcing grid intrinsic width", () => {
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderExact()
    fireEvent.click(screen.getByRole("button", { name: "تجميع حسب المشروع" }))
    const item = screen.getByRole("listitem")
    expect(item.classList.contains("flex-wrap")).toBe(true)
    expect(item.querySelector(".max-w-full.flex-wrap")).toBeTruthy()
    const card = item.closest("section")!
    expect(card.classList.contains("min-w-0")).toBe(true)
    expect(card.parentElement!.classList.contains("grid-cols-1")).toBe(true)
  })

  it("renders historical aggregates beyond the old 21-digit assumption", () => {
    const total = "9223372036854775807000.00"
    listQuery.mockReturnValue({ data: { ...exactData, totals: { ...exactData.totals, total, taggedToProject: total }, groupsByProject: [{ projectId: "project-1", total, count: 100000 }] }, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderExact()
    expect(screen.getAllByText(/9,223,372,036,854,775,807,000/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "تجميع حسب المشروع" }))
    expect(screen.getAllByText(/9,223,372,036,854,775,807,000/).length).toBeGreaterThan(0)
  })

  it("respects plain grouping preference and keeps numeric page as the default export behavior", () => {
    setMoneyGrouping(false)
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderExact()
    expect(screen.getAllByText(/90071992547409\.13/).length).toBeGreaterThan(0)
    expect(ExpensesPage).toBeTruthy()
  })

  it("opens exact detail and shows nullable previous amount as unavailable with ordered revisions", async () => {
    const item = { ...exactExpense, status: "VOIDED" as const, voidReason: "Duplicate", voidedAt: "2026-10-04T10:00:00.000Z", voidedBy: "voider", revisions: [
      { id: "r1", expenseId: exactExpense.id, previousAmount: null, newAmount: exactExpense.amount, changedFields: ["amount"], reason: "Correction", actorUserId: "editor", actorLabel: "Editor", transactionId: "txn-r1", createdAt: "2026-10-04T10:00:00.000Z" },
    ] }
    listQuery.mockReturnValue({ data: { ...exactData, items: [item] }, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: { ...item, revisions: item.revisions }, isPending: false, isError: false })
    renderExact()
    fireEvent.click(screen.getByRole("button", { name: /details|التفاصيل/i }))
    expect(await screen.findByText("txn-1")).toBeTruthy()
    expect(screen.getByText(/غير متاح|Unavailable/i)).toBeTruthy()
    expect(screen.getByText("Correction")).toBeTruthy()
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Workshop")).toBeTruthy()
    expect(within(dialog).getByText("Worker")).toBeTruthy()
    expect(within(dialog).queryByText("project-1")).toBeNull()
  })

  it("keeps the raw ID for a missing soft reference instead of inventing a name", () => {
    const item = { ...exactExpense, sellerId: "missing-seller", projectId: "missing-project", revisions: [] }
    listQuery.mockReturnValue({ data: { ...exactData, items: [item] }, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: item, isPending: false, isError: false, isFetching: false })
    renderExact()
    fireEvent.click(screen.getByRole("button", { name: "التفاصيل" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("missing-project")).toBeTruthy()
    expect(within(dialog).getByText("missing-seller")).toBeTruthy()
  })

  it("shows non-amount changed fields, latest actor and distinct same-day audit times", () => {
    const item = { ...exactExpense, actorLabel: "Latest modifier", status: "VOIDED" as const, voidedAt: "2026-10-04T12:45:00.000Z", revisions: [
      { id: "r1", expenseId: exactExpense.id, previousAmount: exactExpense.amount, newAmount: exactExpense.amount, changedFields: ["projectId", "note"], reason: "Project and note corrected", actorUserId: "editor", actorLabel: "Editor", transactionId: "txn-r1", createdAt: "2026-10-04T10:00:00.000Z" },
      { id: "r2", expenseId: exactExpense.id, previousAmount: exactExpense.amount, newAmount: exactExpense.amount, changedFields: ["whatFor"], reason: "Description corrected", actorUserId: "editor", actorLabel: "Editor", transactionId: "txn-r2", createdAt: "2026-10-04T11:30:00.000Z" },
    ] }
    listQuery.mockReturnValue({ data: { ...exactData, items: [item] }, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: item, isPending: false, isError: false, isFetching: false })
    renderExact()
    fireEvent.click(screen.getByRole("button", { name: "التفاصيل" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("آخر من عدّل السجل").nextElementSibling?.textContent).toBe("Latest modifier")
    expect(within(dialog).queryByText("المنشئ")).toBeNull()
    expect(within(dialog).getByText("الحقول المعدّلة: المشروع، ملاحظات")).toBeTruthy()
    expect(within(dialog).getByText("الحقول المعدّلة: البيان")).toBeTruthy()
    expect(within(dialog).getByText(/11:00/)).toBeTruthy()
    expect(within(dialog).getByText(/12:30/)).toBeTruthy()
    expect(within(dialog).getByText(/13:45|1:45/)).toBeTruthy()
  })

  it("keeps an all-voided project's rows visible in grouped view without charging totals", () => {
    listQuery.mockReturnValue({ data: { ...exactData, items: [{ ...exactExpense, status: "VOIDED" }], groupsByProject: [], totals: { ...exactData.totals, total: "0.00", taggedToProject: "0.00", heldByWorkers: "0.00", count: 0 } }, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderExact()
    fireEvent.click(screen.getByRole("button", { name: "تجميع حسب المشروع" }))
    expect(screen.getByRole("listitem").textContent).toContain("Exact expense")
    expect(screen.getByRole("listitem").textContent).toContain("ملغى")
    expect(screen.getByRole("button", { name: "التفاصيل" })).toBeTruthy()
    expect(screen.getByText("مجموع المعروض · 0 مصروفات")).toBeTruthy()
  })

  it("uses period filters for the month shortcut without converting exact totals", () => {
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    renderExact()
    const button = screen.getByRole("button", { name: "الشهر الحالي" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(listQuery.mock.calls.at(-1)?.[1]).toMatchObject({ fromDate: expect.any(String), toDate: expect.any(String) })
    expect(screen.getByText("إجمالي الفترة")).toBeTruthy()
    fireEvent.click(button)
    expect(screen.getByText("إجمالي كل الفترات")).toBeTruthy()
  })

  it("does not invent zero KPIs during loading and retains real exact values after a refetch error", () => {
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    listQuery.mockReturnValue({ data: undefined, isPending: true, isError: false, isFetching: true })
    const { rerender } = renderExact()
    expect(screen.getByRole("status")).toBeTruthy()
    expect(screen.queryByText("إجمالي كل الفترات")).toBeNull()
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: true, isFetching: false, error: new Error("offline"), refetch: vi.fn() })
    rerender(<ExactExpensesPage {...props} />)
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getAllByText(/90,071,992,547,409\.13/).length).toBeGreaterThan(0)
  })

  it("retains void reason and dialog after a failed void request", async () => {
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    voidMutate.mockRejectedValue(new Error("offline"))
    renderExact()
    const row = screen.getByRole("row", { name: /Exact expense/ })
    fireEvent.click(within(row).getByRole("button", { name: "إلغاء" }))
    const reason = screen.getByLabelText("سبب الإلغاء (اختياري)")
    fireEvent.change(reason, { target: { value: "Duplicate record" } })
    fireEvent.click(screen.getByRole("button", { name: /تأكيد الإلغاء/ }))
    await waitFor(() => expect(voidMutate).toHaveBeenCalled())
    expect(screen.getByDisplayValue("Duplicate record")).toBeTruthy()
    expect(screen.getByRole("heading", { name: /إلغاء المصروف/ })).toBeTruthy()
  })
})
