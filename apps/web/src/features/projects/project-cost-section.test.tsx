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

function cost(overrides: Partial<ProjectCost> = {}): ProjectCost {
  return {
    projectId: "p-1",
    totalDzd: 260_000,
    parts: { expensesDzd: 10_000, salariesDzd: 36_000, stockDzd: 180_000, chargedMaterialsDzd: 34_000 },
    expenses: [
      {
        id: "e-1",
        expenseDate: "2026-05-10T00:00:00.000Z",
        whatFor: "وقود",
        amountDzd: 10_000,
        responsibleWorkerId: "emp-1",
        responsibleWorkerName: "كريم ب.",
        sellerId: null,
        sellerName: null,
      },
    ],
    salaries: [
      {
        paymentId: "pay-1",
        employeeId: "emp-1",
        employeeName: "كريم ب.",
        days: 18,
        dayRateDzd: 2_000,
        amountDzd: 36_000,
        paymentDate: "2026-05-31T00:00:00.000Z",
      },
    ],
    stock: [
      { id: "c-1", assetUnitId: "a-1", assetName: "خلاطة إسمنت", amountDzd: 180_000, placedAt: "2026-05-20T00:00:00.000Z" },
    ],
    materialMovements: [
      {
        id: "m-1",
        itemDefinitionId: "def-1",
        itemName: "إسمنت",
        unit: "كيس",
        quantity: 40,
        unitPriceDzd: 850,
        valueDzd: 34_000,
        direction: "IN",
        occurredAt: "2026-05-20T00:00:00.000Z",
      },
    ],
    parkedInventory: {
      totalDzd: 180_000,
      assets: [{ assetUnitId: "a-9", assetName: "رافعة", purchasePriceDzd: 180_000 }],
    },
    ...overrides,
  }
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ProjectCostSection (#414)", () => {
  it("shows the total, the four labelled sources and each source's rows", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("260,000 دج")).toBeTruthy()
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

  it("renders a positive share for each source, never a bare signed number", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    // 10_000/260_000=4%, 36_000=14%, 180_000=69%, 34_000=13%.
    for (const share of ["4%", "14%", "69%", "13%"]) {
      expect(screen.getByText(share)).toBeTruthy()
    }
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
    expect(screen.getByText((content) => content.includes("−") && content.includes("2,500"))).toBeTruthy()
  })

  it("shows a negative material net with a warning instead of refusing the screen", () => {
    prime(
      cost({
        // The arithmetic sum: 10,000 + 0 + 0 + (-1,500) = 8,500.
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
      }),
    )
    render(<ProjectCostSection projectId="p-1" />)

    // The anomaly renders the screen; it is not an error state and not hidden.
    expect(screen.queryByText(/تعذّر تحميل تكلفة المشروع/)).toBeNull()
    expect(screen.getByText("8,500 دج")).toBeTruthy()
    // The negative material figure is shown as computed ...
    expect(screen.getByText("-1,500 دج")).toBeTruthy()
    // ... with a warning that says what it usually means.
    expect(screen.getByText(/المواد الخارجة من هذا المشروع أكثر من الداخلة إليه/)).toBeTruthy()
  })

  it("shows the parked asset inventory value separately from the cost total", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("مخزون على الموقع")).toBeTruthy()
    // The parked total and the single parked asset are both 180,000 here.
    expect(screen.getAllByText("180,000 دج").length).toBeGreaterThan(0)
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
