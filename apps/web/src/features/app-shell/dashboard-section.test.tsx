// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { DashboardSection } from "./dashboard-section"

// Mock react-i18next to return Arabic strings for the keys the component
// uses (same pattern as roles-section.test.tsx).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "detailPages.shell.itemsGuide": "دليل العناصر",
        "dashboard.quickActions.addProject": "إضافة مشروع",
        "dashboard.quickActions.addWarehouse": "إضافة مستودع",
        "dashboard.quickActions.addInvoice": "إضافة فاتورة",
        "dashboard.quickActions.newTransfer": "تحويل جديد",
      }
      return map[key] ?? key
    },
  }),
}))

// Mock the feature-scoped queries the section aggregates from (issue #23).
const mocks = vi.hoisted(() => ({
  debtsSummary: vi.fn(),
  invoiceGroups: vi.fn(),
  itemDefinitions: vi.fn(),
}))

vi.mock("@/features/debts/debts-queries", () => ({
  useDebtsSummaryQuery: () => mocks.debtsSummary(),
}))

vi.mock("@/features/inventory/inventory-hooks", () => ({
  useInventoryInvoiceGroupsQuery: () => mocks.invoiceGroups(),
  useInventoryItemDefinitionsQuery: () => mocks.itemDefinitions(),
}))

const LABELS = {
  title: "لوحة التحكم",
  description: "نظرة عامة",
  workers: "العمال النشطون",
  projects: "المشاريع النشطة",
  warehouses: "المستودعات الحالية",
  roles: "الأدوار المتاحة",
  invoices: "الفواتير",
  outstandingDebts: "الديون المتبقية",
  items: "دليل العناصر",
  counterparties: "الجهات الخارجية",
}

function renderDashboard(metrics: DashboardSectionMetrics) {
  return render(<DashboardSection labels={LABELS} metrics={metrics} />)
}

type DashboardSectionMetrics = {
  workers: number
  projects: number
  warehouses: number
  roles: number
  counterparties: number
}

describe("DashboardSection (issue #23)", () => {
  it("renders the inherited stat cards unchanged", () => {
    mocks.debtsSummary.mockReturnValue({ data: undefined, isPending: false, isError: false })
    mocks.invoiceGroups.mockReturnValue({ data: undefined, isPending: false, isError: false })
    mocks.itemDefinitions.mockReturnValue({ data: undefined, isPending: false, isError: false })

    renderDashboard({ workers: 2, projects: 3, warehouses: 1, roles: 4, counterparties: 5 })

    expect(screen.getByText("العمال النشطون")).toBeDefined()
    expect(screen.getByText("المشاريع النشطة")).toBeDefined()
    expect(screen.getByText("المستودعات الحالية")).toBeDefined()
    expect(screen.getByText("الأدوار المتاحة")).toBeDefined()
    expect(screen.getByText("2")).toBeDefined()
    expect(screen.getByText("3")).toBeDefined()
  })

  it("renders open invoices, outstanding debts, items and counterparties from the feature queries", () => {
    mocks.debtsSummary.mockReturnValue({
      data: {
        parties: [],
        debtAccounts: [
          {
            accountId: "debt-1",
            partyType: "EXTERNAL_COUNTERPARTY",
            workerId: null,
            externalCounterpartyId: "external-1",
            displayName: "طرف 1",
            phoneNumber: null,
            status: "OPEN",
            direction: "PAYABLE",
            currentBalance: 1500,
            balanceLabel: "مستحق علينا",
            createdAt: "2026-03-13T10:00:00.000Z",
            updatedAt: "2026-03-13T10:00:00.000Z",
          },
          {
            accountId: "debt-2",
            partyType: "EXTERNAL_COUNTERPARTY",
            workerId: null,
            externalCounterpartyId: "external-2",
            displayName: "طرف 2",
            phoneNumber: null,
            status: "SETTLED",
            direction: "PAYABLE",
            currentBalance: 5000,
            balanceLabel: "مسوّى",
            createdAt: "2026-03-13T10:00:00.000Z",
            updatedAt: "2026-03-13T10:00:00.000Z",
          },
        ],
      },
      isPending: false,
      isError: false,
    })
    // Distinct values so a wiring swap (invoices ⇄ items) is caught: open
    // invoices = 1, items = 3, open-debt balance = 1,500 (settled 5,000
    // excluded).
    mocks.invoiceGroups.mockReturnValue({
      data: {
        items: [
          { id: "inv-1", remainingDebtDzd: 0 },
          { id: "inv-2", remainingDebtDzd: 800 },
        ],
      },
      isPending: false,
      isError: false,
    })
    mocks.itemDefinitions.mockReturnValue({
      data: { items: [{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }] },
      isPending: false,
      isError: false,
    })

    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 5 })

    // openInvoices = 1 (only remainingDebtDzd > 0)
    expect(screen.getByText("الفواتير")).toBeDefined()
    // outstandingDebts = 1,500 (SETTLED 5,000 excluded) → ar-DZ formatted
    expect(screen.getByText("الديون المتبقية")).toBeDefined()
    expect(screen.getByText("1.500 د.ج")).toBeDefined()
    // items = 3 (distinct from openInvoices = 1 → no value collision)
    expect(screen.getByText("3")).toBeDefined()
    // counterparties = 5 (prop, from home-view-derived metrics)
    expect(screen.getByText("5")).toBeDefined()
    expect(screen.getByText("الجهات الخارجية")).toBeDefined()
  })

  it("shows a placeholder instead of zero while the feature queries are pending", () => {
    mocks.debtsSummary.mockReturnValue({ data: undefined, isPending: true, isError: false })
    mocks.invoiceGroups.mockReturnValue({ data: undefined, isPending: true, isError: false })
    mocks.itemDefinitions.mockReturnValue({ data: undefined, isPending: true, isError: false })

    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 0 })

    // Density-first: a busy account must never flash "0 د.ج" while loading.
    expect(screen.getAllByText("…")).toHaveLength(3)
    expect(screen.queryByText("0 د.ج")).toBeNull()
  })

  it("shows an error placeholder when a feature query fails (no fake zero)", () => {
    mocks.debtsSummary.mockReturnValue({ data: undefined, isPending: false, isError: true })
    mocks.invoiceGroups.mockReturnValue({ data: undefined, isPending: false, isError: false })
    mocks.itemDefinitions.mockReturnValue({ data: undefined, isPending: false, isError: false })

    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 0 })

    expect(screen.getByText("—")).toBeDefined()
    expect(screen.queryByText("0 د.ج")).toBeNull()
  })

  it("keeps retained counters visible when a BACKGROUND refetch fails (isError with data)", () => {
    // A background refetch that fails AFTER data has loaded keeps the cached
    // data; isError alone must NOT replace the valid totals with "—".
    mocks.debtsSummary.mockReturnValue({
      data: { parties: [], debtAccounts: [] },
      isPending: false,
      isError: true,
    })
    mocks.invoiceGroups.mockReturnValue({
      data: { items: [{ id: "inv-1", remainingDebtDzd: 0 }, { id: "inv-2", remainingDebtDzd: 800 }] },
      isPending: false,
      isError: true,
    })
    mocks.itemDefinitions.mockReturnValue({
      data: { items: [{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }] },
      isPending: false,
      isError: true,
    })

    // Base metrics at 0 so the counter values (invoices=1, items=3) are
    // unambiguous single matches.
    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 0 })
    expect(screen.getByText("1")).toBeDefined()
    expect(screen.getByText("3")).toBeDefined()
    expect(screen.getByText("0 د.ج")).toBeDefined()
    expect(screen.queryByText("—")).toBeNull()
  })
})