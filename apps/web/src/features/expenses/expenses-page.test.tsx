// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { formatAlgeriaDate } from "@/lib/algeria-time"

import { ExpensesPage } from "./expenses-page"

const { useExpensesListQuery, voidMutateAsync } = vi.hoisted(() => ({
  useExpensesListQuery: vi.fn(),
  voidMutateAsync: vi.fn(async () => ({ id: "e-1" })),
}))

vi.mock("./expenses-queries", () => ({
  useExpensesListQuery,
  useCreateExpenseMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateExpenseMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVoidExpenseMutation: () => ({ isPending: false, mutateAsync: voidMutateAsync }),
}))

const ITEMS = [
  {
    id: "e-1",
    amount: 12500,
    expenseDate: "2026-10-03T10:00:00.000Z",
    whatFor: "هاتف للورشة",
    responsibleWorkerId: "worker-1",
    sellerId: "seller-1",
    projectId: "project-1",
    stockItemId: null,
    note: null,
    status: "LIVE" as const,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    actorUserId: "user-1",
    actorLabel: "أمين",
    transactionId: null,
    createdAt: "2026-10-03T10:00:00.000Z",
    updatedAt: "2026-10-03T10:00:00.000Z",
  },
  {
    id: "e-2",
    amount: 9500,
    expenseDate: "2026-10-08T10:00:00.000Z",
    whatFor: "نقل عتاد",
    responsibleWorkerId: "worker-1",
    sellerId: null,
    projectId: null,
    stockItemId: null,
    note: null,
    status: "LIVE" as const,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    actorUserId: "user-1",
    actorLabel: "أمين",
    transactionId: null,
    createdAt: "2026-10-08T10:00:00.000Z",
    updatedAt: "2026-10-08T10:00:00.000Z",
  },
]

const DATA = {
  items: ITEMS,
  totals: {
    total: 22000,
    count: 2,
    taggedToProject: 12500,
    notTaggedToProject: 9500,
    heldByWorkers: 22000,
    workerCount: 1,
  },
  groupsByProject: [
    { projectId: "project-1", total: 12500, count: 1 },
    { projectId: null, total: 9500, count: 1 },
  ],
}

function renderPage() {
  return render(
    <ExpensesPage
      projects={[{ id: "project-1", label: "فيلا حيدرة" }]}
      employees={[{ id: "worker-1", label: "كريم ب." }]}
      sellers={[{ id: "seller-1", label: "محل الإلكترونيات" }]}
      stockItems={[{ id: "item-1", label: "خلاطة إسمنت" }]}
    />,
  )
}

describe("ExpensesPage", () => {
  afterEach(() => {
    cleanup()
    useExpensesListQuery.mockReset()
    voidMutateAsync.mockClear()
  })

  it("renders the KPI totals, the total strip and the dense table", () => {
    useExpensesListQuery.mockReturnValue({
      data: DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    // KPI cards
    expect(screen.getByText("إجمالي الفترة")).toBeTruthy()
    // 22,000 appears in both the KPI card and the total strip.
    expect(screen.getAllByText("22,000 دج").length).toBeGreaterThan(1)
    expect(screen.getByText("مقيّد بمشروع")).toBeTruthy()
    expect(screen.getByText("12,500 دج")).toBeTruthy()
    expect(screen.getByText("لدى العمال")).toBeTruthy()

    // Total strip split
    expect(screen.getByText("مقيّد بمشروع 12,500")).toBeTruthy()
    expect(screen.getByText("بدون مشروع 9,500")).toBeTruthy()

    // Table rows and lookups (the lookups also appear in the filter selects)
    expect(screen.getByText("هاتف للورشة")).toBeTruthy()
    expect(screen.getAllByText("كريم ب.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("محل الإلكترونيات").length).toBeGreaterThan(0)
    expect(screen.getAllByText("فيلا حيدرة").length).toBeGreaterThan(0)
    expect(screen.getAllByText("بدون مشروع").length).toBeGreaterThan(0)
  })

  it("passes the filter bar's date range to the list query", () => {
    useExpensesListQuery.mockReturnValue({
      data: DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(useExpensesListQuery).toHaveBeenCalled()
    const [filters] = useExpensesListQuery.mock.calls.at(-1)!
    expect(filters).toEqual({
      fromDate: expect.any(String),
      toDate: expect.any(String),
    })
    expect(filters.fromDate).toMatch(/T23:00:00\.000Z$/)
  })

  it("switches the same list into project-grouped cards", () => {
    useExpensesListQuery.mockReturnValue({
      data: DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByRole("columnheader", { name: "التاريخ" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "تجميع حسب المشروع" }))

    // The table is replaced by one card per project.
    expect(screen.queryByRole("columnheader", { name: "التاريخ" })).toBeNull()
    expect(screen.getByRole("heading", { name: "فيلا حيدرة" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "بدون مشروع" })).toBeTruthy()
    // The tagged amount now appears both in the KPI card and the group card.
    expect(screen.getAllByText("12,500 دج").length).toBeGreaterThan(1)
    expect(screen.getByText("9,500 دج")).toBeTruthy()
  })

  it("shows the empty state when the filter matches nothing", () => {
    useExpensesListQuery.mockReturnValue({
      data: {
        items: [],
        totals: {
          total: 0,
          count: 0,
          taggedToProject: 0,
          notTaggedToProject: 0,
          heldByWorkers: 0,
          workerCount: 0,
        },
        groupsByProject: [],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByText("لا توجد مصروفات")).toBeTruthy()
  })

  it("renders the stored instant on its Algeria calendar day, not its UTC slice", () => {
    // 2026-09-30T23:00Z is October 1 in Algeria (UTC+1). Slicing the UTC value
    // would render 2026-09-30.
    useExpensesListQuery.mockReturnValue({
      data: {
        ...DATA,
        items: [{ ...ITEMS[0], expenseDate: "2026-09-30T23:00:00.000Z" }],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(
      screen.getByText(formatAlgeriaDate(new Date("2026-09-30T23:00:00.000Z"))),
    ).toBeTruthy()
    expect(screen.queryByText("2026-09-30")).toBeNull()
  })

  it("shows the fractional part of an amount instead of rounding it away", () => {
    useExpensesListQuery.mockReturnValue({
      data: {
        ...DATA,
        items: [{ ...ITEMS[0], amount: 0.1 }],
        totals: { ...DATA.totals, total: 0.1 },
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getAllByText("0.1 دج").length).toBeGreaterThan(0)
  })

  it("offers no Edit button on a voided row", () => {
    useExpensesListQuery.mockReturnValue({
      data: {
        ...DATA,
        items: [{ ...ITEMS[0], id: "e-void", whatFor: "هاتف ملغى", status: "VOIDED" as const }],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    const row = screen.getByRole("row", { name: /هاتف ملغى/ })
    expect(within(row).queryByRole("button", { name: "تعديل" })).toBeNull()
    expect(within(row).getByText("لا يمكن تعديل مصروف ملغى")).toBeTruthy()
  })
})
