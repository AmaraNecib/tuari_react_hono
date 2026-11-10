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
      { id: "r1", expenseId: exactExpense.id, previousAmount: null, newAmount: exactExpense.amount, reason: "Correction", actorUserId: "editor", actorLabel: "Editor", transactionId: "txn-r1", createdAt: "2026-10-04T10:00:00.000Z" },
    ] }
    listQuery.mockReturnValue({ data: { ...exactData, items: [item] }, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: { ...item, revisions: item.revisions }, isPending: false, isError: false })
    renderExact()
    fireEvent.click(screen.getByRole("button", { name: /details|التفاصيل/i }))
    expect(await screen.findByText("txn-1")).toBeTruthy()
    expect(screen.getByText(/غير متاح|Unavailable/i)).toBeTruthy()
    expect(screen.getByText("Correction")).toBeTruthy()
  })

  it("retains void reason and dialog after a failed void request", async () => {
    listQuery.mockReturnValue({ data: exactData, isPending: false, isError: false, isFetching: false })
    detailQuery.mockReturnValue({ data: undefined, isPending: false, isError: false })
    voidMutate.mockRejectedValue(new Error("offline"))
    renderExact()
    const row = screen.getByRole("row", { name: /Exact expense/ })
    fireEvent.click(within(row).getByRole("button", { name: "إلغاء" }))
    const reason = screen.getByPlaceholderText(/سبب الإلغاء/)
    fireEvent.change(reason, { target: { value: "Duplicate record" } })
    fireEvent.click(screen.getByRole("button", { name: /تأكيد الإلغاء/ }))
    await waitFor(() => expect(voidMutate).toHaveBeenCalled())
    expect(screen.getByDisplayValue("Duplicate record")).toBeTruthy()
    expect(screen.getByRole("heading", { name: /إلغاء المصروف/ })).toBeTruthy()
  })
})
