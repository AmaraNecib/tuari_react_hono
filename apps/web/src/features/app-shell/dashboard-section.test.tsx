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

// Mock the exact financial reads used by the production dashboard.
const mocks = vi.hoisted(() => ({
  debtsSummary: vi.fn(),
  invoiceGroups: vi.fn(),
  itemDefinitions: vi.fn(),
  financial: { debts: { summary: vi.fn() }, inventory: { listInvoices: vi.fn(), definitions: vi.fn() } },
}))

vi.mock("@/lib/orpc-client", () => ({ financialClient: mocks.financial }))
vi.mock("@/features/debts/debts-exact-queries", () => ({
  useExactDebtSummary: (client: unknown) => { expect(client).toBe(mocks.financial.debts); return mocks.debtsSummary() },
}))
vi.mock("@/features/inventory/inventory-exact-queries", () => ({
  useExactInventoryInvoices: (client: unknown) => { expect(client).toBe(mocks.financial.inventory); return mocks.invoiceGroups() },
  useExactInventoryDefinitions: (client: unknown) => { expect(client).toBe(mocks.financial.inventory); return mocks.itemDefinitions() },
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
      data: { accounts: [
        { id: "debt-1", partyType: "EXTERNAL_COUNTERPARTY", workerId: null, externalCounterpartyId: "external-1", status: "OPEN", direction: "PAYABLE", currentBalance: "1500.00" },
        { id: "debt-2", partyType: "EXTERNAL_COUNTERPARTY", workerId: null, externalCounterpartyId: "external-2", status: "SETTLED", direction: "PAYABLE", currentBalance: "5000.00" },
      ] },
      isPending: false,
      isError: false,
    })
    // Distinct values so a wiring swap (invoices ⇄ items) is caught: open
    // invoices = 1, items = 3, open-debt balance = 1,500 (settled 5,000
    // excluded).
    mocks.invoiceGroups.mockReturnValue({
      data: [
        { id: "inv-1", remainingDebtDzd: "0.00" },
        { id: "inv-2", remainingDebtDzd: "800.00" },
      ],
      isPending: false,
      isError: false,
    })
    mocks.itemDefinitions.mockReturnValue({
      data: [{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }],
      isPending: false,
      isError: false,
    })

    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 5 })

    // openInvoices = 1 (only remainingDebtDzd > 0)
    expect(screen.getByText("الفواتير")).toBeDefined()
    // outstandingDebts = 1,500 (SETTLED 5,000 excluded) → ar-DZ formatted
    expect(screen.getByText("الديون المتبقية")).toBeDefined()
    const amount = screen.getByText("1.500", { selector: 'bdi[dir="ltr"]' })
    expect(amount.parentElement?.getAttribute("dir")).toBe("ltr")
    expect(amount.previousElementSibling?.textContent).toBe("د.ج")
    expect(amount.previousElementSibling?.getAttribute("dir")).toBe("rtl")
    // items = 3 (distinct from openInvoices = 1 → no value collision)
    expect(screen.getByText("3")).toBeDefined()
    // counterparties = 5 (prop, from home-view-derived metrics)
    expect(screen.getByText("5")).toBeDefined()
    expect(screen.getByText("الجهات الخارجية")).toBeDefined()
  })

  it("keeps wide debt totals exact when aggregating dashboard balances", () => {
    mocks.debtsSummary.mockReturnValue({
      data: { accounts: [
        { id: "large", status: "OPEN", currentBalance: "90071992547409.93" },
        { id: "cents", status: "OPEN", currentBalance: "0.08" },
      ] },
      isPending: false,
      isError: false,
    })
    mocks.invoiceGroups.mockReturnValue({ data: [], isPending: false, isError: false })
    mocks.itemDefinitions.mockReturnValue({ data: [], isPending: false, isError: false })

    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 0 })

    expect(screen.getByText("90.071.992.547.410.01", { selector: 'bdi[dir="ltr"]' })).toBeTruthy()
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
      data: { accounts: [] },
      isPending: false,
      isError: true,
    })
    mocks.invoiceGroups.mockReturnValue({
      data: [{ id: "inv-1", remainingDebtDzd: "0.00" }, { id: "inv-2", remainingDebtDzd: "800.00" }],
      isPending: false,
      isError: true,
    })
    mocks.itemDefinitions.mockReturnValue({
      data: [{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }],
      isPending: false,
      isError: true,
    })

    // Base metrics at 0 so the counter values (invoices=1, items=3) are
    // unambiguous single matches.
    renderDashboard({ workers: 0, projects: 0, warehouses: 0, roles: 0, counterparties: 0 })
    expect(screen.getByText("1")).toBeDefined()
    expect(screen.getByText("3")).toBeDefined()
    expect(screen.getByText("0", { selector: 'bdi[dir="ltr"]' })).toBeDefined()
    expect(screen.queryByText("—")).toBeNull()
  })
})