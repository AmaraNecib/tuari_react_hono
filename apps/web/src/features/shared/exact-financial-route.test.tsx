// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  financial: { debts: { summary: vi.fn() }, invoices: { listInvoices: vi.fn() }, inventory: { definitions: vi.fn() }, expenses: { expensesList: vi.fn() } },
  pages: { debts: vi.fn((props: unknown) => { void props; return <div data-testid="debts-page" /> }), invoices: vi.fn((props: unknown) => { void props; return <div data-testid="invoices-page" /> }), inventory: vi.fn((props: unknown) => { void props; return <div data-testid="inventory-page" /> }), expenses: vi.fn((props: unknown) => { void props; return <div data-testid="expenses-page" /> }), catalog: vi.fn(() => <div data-testid="catalog-page" />) },
}))

vi.mock("@/lib/orpc-client", () => ({ financialClient: mocks.financial }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "rtl" } }) }))
vi.mock("@/features/debts/debts-exact-page", () => ({ ExactDebtsPage: (props: unknown) => mocks.pages.debts(props) }))
vi.mock("@/features/expenses/expenses-page", () => ({ ExactExpensesPage: (props: unknown) => mocks.pages.expenses(props) }))
vi.mock("@/features/inventory/inventory-exact-page", () => ({ ExactInventoryPage: (props: unknown) => mocks.pages.inventory(props) }))
vi.mock("@/features/inventory/inventory-item-definitions-page", () => ({ InventoryItemDefinitionsPage: () => mocks.pages.catalog() }))
vi.mock("@/features/invoices/invoices-exact-page", () => ({ ExactInvoicesPage: (props: unknown) => mocks.pages.invoices(props) }))

import { ExactFinancialRoutePage } from "./exact-financial-route"

const emptyExpenses = { projects: [], employees: [], sellers: [] }

describe("normal exact-financial route composition", () => {
  it("carries manager payroll options separately from worker-only debt parties", () => {
    render(<ExactFinancialRoutePage route="debts" parties={[]} payrollEmployees={[{ id: "manager", label: "Project manager" }]} locations={[]} expenses={emptyExpenses} />)
    expect(mocks.pages.debts).toHaveBeenLastCalledWith(expect.objectContaining({
      parties: [], payrollEmployees: [{ id: "manager", label: "Project manager", partyType: "INTERNAL_WORKER" }],
    }))
  })
  it("binds the exact debt and invoice clients and carries route intent", () => {
    const party = { id: "worker-1", label: "Worker", type: "WORKER" as const }
    const view = render(<ExactFinancialRoutePage route="debts" parties={[party]} locations={[]} expenses={emptyExpenses} />)
    expect(mocks.pages.debts).toHaveBeenCalledWith(expect.objectContaining({
      client: mocks.financial.debts,
      parties: [{ id: "worker-1", label: "Worker", partyType: "INTERNAL_WORKER" }],
    }))

    view.rerender(<ExactFinancialRoutePage route="invoices" parties={[party]} locations={[]} expenses={emptyExpenses} invoiceId="invoice-7" />)
    expect(mocks.pages.invoices).toHaveBeenCalledWith(expect.objectContaining({
      client: mocks.financial.invoices,
      parties: [party],
      initialInvoiceId: "invoice-7",
      initialCreate: undefined,
    }))

    view.rerender(<ExactFinancialRoutePage route="invoices" parties={[party]} locations={[]} expenses={emptyExpenses} createInvoice />)
    expect(mocks.pages.invoices).toHaveBeenLastCalledWith(expect.objectContaining({ initialCreate: true }))
  })

  it("passes real expense metadata and keeps catalog editing available beside exact inventory", () => {
    const projects = [{ id: "project-1", label: "Project" }]
    const locations = [{ id: "warehouse-1", label: "Warehouse", type: "WAREHOUSE" as const }]
    const expenses = { ...emptyExpenses, projects }
    const view = render(<ExactFinancialRoutePage route="expenses" parties={[]} locations={[]} expenses={expenses} />)
    expect(mocks.pages.expenses).toHaveBeenCalledWith(expect.objectContaining({
      client: mocks.financial.expenses,
      projects,
    }))

    view.rerender(<ExactFinancialRoutePage route="inventory" parties={[]} locations={locations} expenses={emptyExpenses} />)
    expect(mocks.pages.inventory).toHaveBeenCalledWith(expect.objectContaining({
      client: mocks.financial.inventory,
      locations,
    }))
    fireEvent.click(screen.getByRole("button", { name: "inventoryPage.itemDefinitions.title" }))
    expect(screen.getByTestId("catalog-page")).toBeTruthy()
  })
})
