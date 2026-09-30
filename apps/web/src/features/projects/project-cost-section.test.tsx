// @vitest-environment jsdom

import "@/i18n"

import { cleanup, render, screen } from "@testing-library/react"
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
    parts: { expensesDzd: 10_000, salariesDzd: 36_000, stockDzd: 180_000, consumablesDzd: 34_000 },
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
    consumables: [
      {
        id: "m-1",
        itemDefinitionId: "def-1",
        itemName: "إسمنت",
        unit: "كيس",
        quantity: 40,
        unitPriceDzd: 850,
        valueDzd: 34_000,
        movementType: "TRANSFER",
        occurredAt: "2026-05-20T00:00:00.000Z",
      },
    ],
    parkedInventory: {
      totalDzd: 188_500,
      assets: [{ assetUnitId: "a-9", assetName: "رافعة", purchasePriceDzd: 180_000 }],
      consumables: [
        { itemDefinitionId: "def-1", itemName: "إسمنت", unit: "كيس", quantity: 10, unitPriceDzd: 850, valueDzd: 8_500 },
      ],
    },
    ...overrides,
  }
}

function prime(data: ProjectCost | undefined, extras: Partial<ReturnType<typeof useProjectCostQuery>> = {}) {
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
    expect(screen.getAllByText("مواد مستهلكة").length).toBeGreaterThan(0)

    // The lists behind each source explain the number.
    expect(screen.getByText("وقود")).toBeTruthy()
    expect(screen.getByText(/18 يومًا/)).toBeTruthy()
    expect(screen.getByText("خلاطة إسمنت")).toBeTruthy()
    expect(screen.getAllByText("إسمنت").length).toBeGreaterThan(0)
  })

  it("renders a positive share for each source, never a bare signed number", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    // 10_000 / 260_000 = 4%, etc.
    expect(screen.getByText("4%")).toBeTruthy()
    expect(screen.getByText("14%")).toBeTruthy()
    expect(screen.getByText("69%")).toBeTruthy()
    expect(screen.getByText("13%")).toBeTruthy()
  })

  it("shows the parked inventory value separately from the cost total", () => {
    prime(cost())
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("مخزون على الموقع")).toBeTruthy()
    expect(screen.getByText("188,500 دج")).toBeTruthy()
    expect(screen.getByText("رافعة")).toBeTruthy()
  })

  it("shows an empty state that says what to do when the project has no cost", () => {
    prime(
      cost({
        totalDzd: 0,
        parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0, consumablesDzd: 0 },
        expenses: [],
        salaries: [],
        stock: [],
        consumables: [],
        parkedInventory: { totalDzd: 0, assets: [], consumables: [] },
      }),
    )
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText("لا توجد تكلفة على هذا المشروع بعد")).toBeTruthy()
    expect(screen.getByText("إضافة مصروف")).toBeTruthy()
    expect(screen.getByText("نقل عتاد إلى المشروع")).toBeTruthy()
    expect(screen.getByText("دفع أجر")).toBeTruthy()
  })

  it("shows a loading state instead of an empty total", () => {
    prime(undefined, { isPending: true } as never)
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.queryByText("لا توجد تكلفة على هذا المشروع بعد")).toBeNull()
  })

  it("shows an error surface with a retry instead of a zero total", () => {
    prime(undefined, { isError: true } as never)
    render(<ProjectCostSection projectId="p-1" />)

    expect(screen.getByText(/تعذّر تحميل تكلفة المشروع/)).toBeTruthy()
  })
})
