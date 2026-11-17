// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProjectCost } from "@tuari/contracts"

import { ProjectCostSection } from "./project-cost-section"

const { useProjectCostQuery, mockNavigate, mockNavigateToWorkspaceRoute } = vi.hoisted(() => ({
  useProjectCostQuery: vi.fn(),
  mockNavigate: vi.fn(),
  mockNavigateToWorkspaceRoute: vi.fn(),
}))

vi.mock("./project-cost-queries", () => ({ useProjectCostQuery }))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }))

vi.mock("@/router/navigation", () => ({
  navigateToWorkspaceRoute: mockNavigateToWorkspaceRoute,
  workspaceRoutes: {
    expenses: () => "/expenses",
    salaries: () => "/salaries",
    projectTab: (id: string, tab: string) => `/projects/${id}?tab=${tab}`,
  },
}))

type LegacyProjectCost = {
  projectId: string
  totalDzd: number
  parts: { expensesDzd: number; salariesDzd: number; stockDzd: number; chargedMaterialsDzd: number }
  expenses: Array<{ id: string; expenseDate: string; whatFor: string | null; amountDzd: number; responsibleWorkerId: string | null; responsibleWorkerName: string | null; sellerId: string | null; sellerName: string | null }>
  salaries: Array<{ paymentId: string; employeeId: string; employeeName: string | null; days: number; amountDzd: number; paymentDate: string }>
  stock: Array<{ id: string; assetUnitId: string; assetName: string | null; amountDzd: number; placedAt: string }>
  materialMovements: Array<{ id: string; itemDefinitionId: string | null; itemName: string | null; unit: string | null; quantity: number; unitPriceDzd: number | null; valueDzd: number; direction: "IN" | "OUT"; occurredAt: string }>
  parkedInventory: { totalDzd: number; assets: Array<{ assetUnitId: string; assetName: string | null; purchasePriceDzd: number }> }
}

function cost(overrides: Partial<LegacyProjectCost> = {}): ProjectCost {
  const legacy = {
    projectId: "p-1",
    totalDzd: 260_000,
    parts: { expensesDzd: 10_000, salariesDzd: 36_000, stockDzd: 180_000, chargedMaterialsDzd: 34_000 },
    expenses: [{ id: "e-1", expenseDate: "2026-05-10T00:00:00.000Z", whatFor: "وقود", amountDzd: 10_000, responsibleWorkerId: "emp-1", responsibleWorkerName: "كريم ب.", sellerId: null, sellerName: null }],
    salaries: [{ paymentId: "pay-1", employeeId: "emp-1", employeeName: "كريم ب.", days: 18, amountDzd: 36_000, paymentDate: "2026-05-31T00:00:00.000Z" }],
    stock: [{ id: "c-1", assetUnitId: "a-1", assetName: "خلاطة إسمنت", amountDzd: 180_000, placedAt: "2026-05-20T00:00:00.000Z" }],
    materialMovements: [{ id: "m-1", itemDefinitionId: "def-1", itemName: "إسمنت", unit: "كيس", quantity: 40, unitPriceDzd: 850, valueDzd: 34_000, direction: "IN", occurredAt: "2026-05-20T00:00:00.000Z" }],
    parkedInventory: { totalDzd: 180_000, assets: [{ assetUnitId: "a-9", assetName: "رافعة", purchasePriceDzd: 180_000 }] },
    ...overrides,
  } as LegacyProjectCost
  const amount = (value: number) => value.toFixed(2)
  return {
    projectId: legacy.projectId,
    currencyCode: "DZD",
    totalAmount: amount(legacy.totalDzd),
    parts: { expensesAmount: amount(legacy.parts.expensesDzd), salariesAmount: amount(legacy.parts.salariesDzd), stockAmount: amount(legacy.parts.stockDzd), chargedMaterialsAmount: amount(legacy.parts.chargedMaterialsDzd) },
    expenses: legacy.expenses.map((row) => ({ ...row, amount: amount(row.amountDzd) })),
    salaries: legacy.salaries.map((row, ordinal) => ({ earningId: row.paymentId, segmentId: `${row.paymentId}:${ordinal}`, employeeId: row.employeeId, employeeName: row.employeeName, ordinal, days: row.days, amount: amount(row.amountDzd), periodStart: row.paymentDate, periodEnd: row.paymentDate, approvedAt: row.paymentDate })),
    stock: legacy.stock.map((row) => ({ ...row, amount: amount(row.amountDzd) })),
    materialMovements: legacy.materialMovements.map((row) => ({ ...row, quantity: String(row.quantity), unitPrice: row.unitPriceDzd == null ? null : `${amount(row.unitPriceDzd)}00`, valueAmount: amount(row.valueDzd) })),
    parkedInventory: { totalAmount: amount(legacy.parkedInventory.totalDzd), assets: legacy.parkedInventory.assets.map((row) => ({ ...row, purchaseAmount: amount(row.purchasePriceDzd) })) },
  } as unknown as ProjectCost
}

function prime(data: ProjectCost | undefined, extras: Record<string, unknown> = {}) {
  useProjectCostQuery.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...extras,
  })
}

/**
 * Expenses 10,000, material net -1,500 → total 8,500. The expenses part is
 * 117.6% of that total, the scenario the share cap exists for.
 */
function negativeNetCost(): ProjectCost {
  return cost({
    totalDzd: 8_500,
    parts: { expensesDzd: 10_000, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: -1_500 },
    expenses: [
      {
        id: "e-1",
        expenseDate: "2026-05-10T00:00:00.000Z",
        whatFor: "وقود",
        amountDzd: 10_000,
        responsibleWorkerId: null,
        responsibleWorkerName: null,
        sellerId: null,
        sellerName: null,
      },
    ],
    salaries: [],
    stock: [],
    materialMovements: [
      {
        id: "m-out",
        itemDefinitionId: "def-1",
        itemName: "إسمنت",
        unit: "كيس",
        quantity: 3,
        unitPriceDzd: 500,
        valueDzd: 1_500,
        direction: "OUT",
        occurredAt: "2026-05-21T00:00:00.000Z",
      },
    ],
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ProjectCostSection (#414)", () => {
  it("renders approved A/B/A segments as separate rows with their exact amounts", () => {
    const exactCost = {
      projectId: "p-1",
      currencyCode: "DZD",
      totalAmount: "60000.06",
      parts: { expensesAmount: "0.00", salariesAmount: "60000.06", stockAmount: "0.00", chargedMaterialsAmount: "0.00" },
      expenses: [],
      salaries: [
        { earningId: "earn-1", segmentId: "seg-a1", employeeId: "emp-1", employeeName: "كريم ب.", ordinal: 0, days: 5, amount: "10000.01", periodStart: "2026-05-01T00:00:00.000Z", periodEnd: "2026-05-31T00:00:00.000Z", approvedAt: "2026-06-01T00:00:00.000Z" },
        { earningId: "earn-1", segmentId: "seg-b", employeeId: "emp-2", employeeName: "سليم", ordinal: 1, days: 15, amount: "20000.02", periodStart: "2026-05-01T00:00:00.000Z", periodEnd: "2026-05-31T00:00:00.000Z", approvedAt: "2026-06-01T00:00:00.000Z" },
        { earningId: "earn-1", segmentId: "seg-a2", employeeId: "emp-1", employeeName: "كريم ب.", ordinal: 2, days: 5, amount: "30000.03", periodStart: "2026-05-01T00:00:00.000Z", periodEnd: "2026-05-31T00:00:00.000Z", approvedAt: "2026-06-01T00:00:00.000Z" },
      ],
      stock: [],
      materialMovements: [],
      parkedInventory: { totalAmount: "0.00", assets: [] },
    } satisfies ProjectCost
    prime(exactCost)
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getAllByText("كريم ب.")).toHaveLength(2)
    expect(screen.getByText("سليم")).toBeTruthy()
    expect(screen.getAllByText(/5 يومًا/)).toHaveLength(3)
    expect(screen.getByText(/15 يومًا/)).toBeTruthy()
    expect(screen.getAllByText("10,000.01", { selector: 'bdi[dir="ltr"]' })).toHaveLength(1)
    expect(screen.getAllByText("20,000.02", { selector: 'bdi[dir="ltr"]' })).toHaveLength(1)
    expect(screen.getAllByText("30,000.03", { selector: 'bdi[dir="ltr"]' })).toHaveLength(1)
  })
  it("shows the total, the four labelled sources and each source's rows", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("260,000", { selector: 'bdi[dir="ltr"]' })).toBeTruthy()
    const amounts = [...document.querySelectorAll('span[dir="ltr"] > span[dir="rtl"] + bdi[dir="ltr"]')]
    expect(amounts.map(el => el.textContent)).toEqual([
      "260,000", "10,000", "36,000", "180,000", "34,000", "10,000", "36,000", "180,000", "850", "+34,000", "180,000", "180,000",
    ])
    expect(amounts.every(el => el.previousElementSibling?.textContent === "دج" && el.previousElementSibling.getAttribute("dir") === "rtl")).toBe(true)
    expect(document.body.textContent).not.toContain("[object Object]")
    expect(screen.getByText("مصروفات")).toBeTruthy()
    expect(screen.getByText("أجور (أيام موزّعة)")).toBeTruthy()
    expect(screen.getByText("عتاد مخصّص")).toBeTruthy()
    // The source label and the source card share the phrase; both must render.
    expect(screen.getAllByText("المواد المحمّلة على المشروع")).toHaveLength(2)

    // The lists behind each source explain the number.
    expect(screen.getByText("وقود")).toBeTruthy()
    expect(screen.getByText(/18 يومًا/)).toBeTruthy()
    expect(screen.getByText("خلاطة إسمنت")).toBeTruthy()
    // The material movement names the item and carries its direction.
    expect(screen.getByText("إسمنت")).toBeTruthy()
    expect(screen.getByText(/إضافة إلى المشروع/)).toBeTruthy()
  })

  it("preserves the source markers, exact-derived bars and percentage labels", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    for (const amount of ["10,000", "36,000", "180,000", "34,000"]) {
      expect(screen.getAllByText(amount, { selector: 'bdi[dir="ltr"]' }).length).toBeGreaterThan(0)
    }
    for (const share of ["4%", "14%", "69%", "13%"]) {
      expect(screen.getByText(share)).toBeTruthy()
    }
    for (const [color, width] of [["bg-chart-1", "4%"], ["bg-chart-2", "14%"], ["bg-chart-3", "69%"], ["bg-chart-4", "13%"]]) {
      expect(document.querySelectorAll(`.${color}`)).toHaveLength(2)
      expect(document.querySelector(`.${color}[style*="width"]`)?.getAttribute("style")).toContain(`width: ${width}`)
    }
  })

  it("renders a four-place material unit price with the DZD currency", () => {
    const data = cost()
    const movement = data.materialMovements[0]!
    movement.unitPrice = "850.1250"
    movement.quantity = "1234.500000"
    prime(data)
    render(<ProjectCostSection projectId="p-1" />)

    const price = screen.getByText("850.125", { selector: 'bdi[dir="ltr"]' })
    expect(price.previousElementSibling?.textContent).toBe("دج")
    expect(price.previousElementSibling?.getAttribute("dir")).toBe("rtl")
    expect(screen.getByText(/1,234\.5 كيس/)).toBeTruthy()
  })

  it("marks a material movement out of the project as a reversal", () => {
    prime(
      cost({
        parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: 2_500 },
        totalDzd: 2_500,
        materialMovements: [
          {
            id: "m-in",
            itemDefinitionId: "def-1",
            itemName: "إسمنت",
            unit: "كيس",
            quantity: 10,
            unitPriceDzd: 500,
            valueDzd: 5_000,
            direction: "IN",
            occurredAt: "2026-05-20T00:00:00.000Z",
          },
          {
            id: "m-out",
            itemDefinitionId: "def-1",
            itemName: "إسمنت",
            unit: "كيس",
            quantity: 5,
            unitPriceDzd: 500,
            valueDzd: 2_500,
            direction: "OUT",
            occurredAt: "2026-05-21T00:00:00.000Z",
          },
        ],
        expenses: [],
        salaries: [],
        stock: [],
      }),
    )
    render(<ProjectCostSection projectId="p-1" />)

    // Both directions are visible with their sign, so the net is explained.
    expect(screen.getByText(/إضافة إلى المشروع/)).toBeTruthy()
    expect(screen.getByText(/إخراج من المشروع/)).toBeTruthy()
    expect([...document.querySelectorAll('span[dir="ltr"]')].some((element) => element.textContent?.includes("−") && element.textContent.includes("2,500"))).toBe(true)
  })

  it("shows a negative material net with a warning instead of refusing the screen", () => {
    prime(negativeNetCost())
    render(<ProjectCostSection projectId="p-1" />)

    // The anomaly renders the screen; it is not an error state and not hidden.
    expect(screen.queryByText(/تعذّر تحميل تكلفة المشروع/)).toBeNull()
    expect(screen.getByText("8,500", { selector: 'bdi[dir="ltr"]' })).toBeTruthy()
    // The negative material figure is shown as computed ...
    expect(screen.getByText("-1,500", { selector: 'bdi[dir="ltr"]' })).toBeTruthy()
    // ... with a warning that says what it usually means.
    expect(screen.getByText(/المواد الخارجة من هذا المشروع أكثر من الداخلة إليه/)).toBeTruthy()
  })

  it("keeps source shares clamped for a negative material net", () => {
    prime(negativeNetCost())
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("8,500", { selector: 'bdi[dir="ltr"]' })).toBeTruthy()
    expect(screen.getByText("-1,500", { selector: 'bdi[dir="ltr"]' })).toBeTruthy()
    expect(screen.queryByText("118%")).toBeNull()
    expect(screen.getByText("100%")).toBeTruthy()
    const shares = screen.getAllByText(/^\d+%$/)
    expect(shares.length).toBeGreaterThan(0)
    for (const share of shares) {
      expect(Number.parseInt(share.textContent ?? "", 10)).toBeLessThanOrEqual(100)
    }
    expect(screen.getAllByText("0%")).toHaveLength(3)
  })

  it("shows the parked asset inventory value separately from the cost total", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("مخزون على الموقع")).toBeTruthy()
    // The parked total and the single parked asset are both 180,000 here.
    expect(screen.getAllByText("180,000", { selector: 'bdi[dir="ltr"]' }).length).toBeGreaterThan(0)
    expect(screen.getByText("رافعة")).toBeTruthy()
  })

  it("shows an empty state that says what to do when the project has no cost", () => {
    prime(
      cost({
        totalDzd: 0,
        parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: 0 },
        expenses: [],
        salaries: [],
        stock: [],
        materialMovements: [],
        parkedInventory: { totalDzd: 0, assets: [] },
      }),
    )
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("لا توجد تكلفة على هذا المشروع بعد")).toBeTruthy()
    expect(screen.getByText("إضافة مصروف")).toBeTruthy()
    expect(screen.getByText("نقل عتاد إلى المشروع")).toBeTruthy()
    expect(screen.getByText("دفع أجر")).toBeTruthy()
  })

  it("keeps the empty-cost state but still shows a parked asset for a parked-only project", () => {
    prime(
      cost({
        totalDzd: 0,
        parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: 0 },
        expenses: [],
        salaries: [],
        stock: [],
        materialMovements: [],
        parkedInventory: {
          totalDzd: 180_000,
          assets: [{ assetUnitId: "a-9", assetName: "رافعة", purchasePriceDzd: 180_000 }],
        },
      }),
    )
    render(<ProjectCostSection projectId="p-1" />)

    // No cost and parked inventory are two different facts; both are true here.
    expect(screen.getByText("لا توجد تكلفة على هذا المشروع بعد")).toBeTruthy()
    expect(screen.getByText("مخزون على الموقع")).toBeTruthy()
    expect(screen.getByText("رافعة")).toBeTruthy()
  })

  it("routes the empty-state actions to the screens that create a cost", () => {
    prime(
      cost({
        totalDzd: 0,
        parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: 0 },
        expenses: [],
        salaries: [],
        stock: [],
        materialMovements: [],
        parkedInventory: { totalDzd: 0, assets: [] },
      }),
    )
    const onOpenItems = vi.fn()
    render(<ProjectCostSection projectId="p-1" onOpenItems={onOpenItems} />)

    fireEvent.click(screen.getByText("إضافة مصروف"))
    expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/expenses")

    fireEvent.click(screen.getByText("نقل عتاد إلى المشروع"))
    expect(onOpenItems).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText("دفع أجر"))
    expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/salaries")
  })

  it("shows a loading state instead of an empty total", () => {
    prime(undefined, { isPending: true })
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("جارٍ التنفيذ...")).toBeTruthy()
    expect(screen.queryByText("لا توجد تكلفة على هذا المشروع بعد")).toBeNull()
  })

  it("shows an error surface with a retry that refetches, not a zero total", () => {
    const refetch = vi.fn()
    prime(undefined, { isError: true, refetch })
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText(/تعذّر تحميل تكلفة المشروع/)).toBeTruthy()
    fireEvent.click(screen.getByText("إعادة المحاولة"))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
