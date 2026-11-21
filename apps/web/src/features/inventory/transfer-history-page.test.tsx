import "@/i18n"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TransferHistoryPage } from "./transfer-history-page"
const mocks = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock("./transfer-history-hooks", () => ({ useTransferHistoryQuery: () => mocks.history() }))
afterEach(cleanup)
describe("transfer history exact display", () => {
  it("shows mixed purchase destinations and discloses whole invoice amounts", () => {
    mocks.history.mockReturnValue({ data: { items: [{
      id: "mixed", date: "2026-11-10T10:00:00.000Z", type: "PURCHASE", from: null, to: null,
      counterparty: { id: "supplier", name: "Supplier" },
      items: [{ id: "a", name: "Cement", quantity: 2, to: { type: "WAREHOUSE", id: "same", name: "Depot" } },
        { id: "b", name: "Sand", quantity: 4, to: { type: "PROJECT", id: "same", name: "Site" } }],
      totalAmountDzd: "30.00", paidAmountDzd: "1.00", remainingDebtDzd: "29.00", paymentStatus: "PARTIAL",
    }] }, isPending: false, isError: false })
    render(<TransferHistoryPage />)
    expect(screen.getByText("مبالغ الفاتورة كاملة، وليست قيمة الأصناف المعروضة")).toBeTruthy()
    expect(screen.getByText("Depot").getAttribute("href")).toBe("/warehouses/same")
    expect(screen.getByText("Site").getAttribute("href")).toBe("/projects/same")
    expect(screen.getByText("30")).toBeTruthy()
    expect(screen.getByText("29")).toBeTruthy()
  })

  it("discloses whole purchase invoice totals even when purchases are outside the visible page", () => {
    mocks.history.mockReturnValue({ data: { summary: { total: 51, sales: 50, internal: 0, totalAmountDzd: "130.00" }, items: [] }, isPending: false, isError: false })
    render(<TransferHistoryPage />)
    expect(screen.getByText("يتضمن الإجمالي مبالغ فواتير الشراء كاملة، لا قيمة أصناف الموقع فقط")).toBeTruthy()
    expect(screen.getByText("130")).toBeTruthy()
  })

  it.each(["00", "01"])("renders a wide aggregate with cents %s and actual history rows", cents => {
    mocks.history.mockReturnValue({ data: { summary: { total: 100, sales: 100, internal: 0, totalAmountDzd: `120000000000000000.${cents}` }, items: [`60000000000000000.${cents}`].map((totalAmountDzd, id) => ({
      id: String(id), date: "2026-11-10T10:00:00.000Z", type: "SALE", from: null, to: null, counterparty: null,
      items: [], totalAmountDzd, paidAmountDzd: "0.00", remainingDebtDzd: totalAmountDzd, currency: "DZD", paymentStatus: "UNPAID", status: "COMPLETED", note: null,
    })) }, isPending: false, isError: false })
    render(<TransferHistoryPage />)
    expect(screen.getByText(`120,000,000,000,000,000${cents === "00" ? "" : ".01"}`)).toBeTruthy()
    expect(screen.getAllByText(`60,000,000,000,000,000${cents === "00" ? "" : ".01"}`).length).toBeGreaterThan(0)
  })
})
