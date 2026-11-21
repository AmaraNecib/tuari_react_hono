import "@/i18n"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocationTransferHistory } from "./location-transfer-history"

const mocks = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock("./transfer-history-hooks", () => ({ useLocationTransferHistoryQuery: () => mocks.history() }))
afterEach(cleanup)

const transfer = {
  id: "internal-transfer",
  date: "2026-11-21T10:00:00.000Z",
  type: "INTERNAL" as const,
  from: { type: "WAREHOUSE" as const, id: "source", name: "المستودع المصدر" },
  to: { type: "WAREHOUSE" as const, id: "target", name: "المستودع الهدف" },
  counterparty: null,
  items: [
    { id: "cement", name: "إسمنت", quantity: 5, type: "CONSUMABLE" as const, priceSource: null },
    { id: "fine", name: "مادة دقيقة", quantity: 0.000001, type: "CONSUMABLE" as const, priceSource: null },
  ],
  totalAmountDzd: null,
  paidAmountDzd: null,
  remainingDebtDzd: null,
  currency: null,
  paymentStatus: "N/A" as const,
  status: "COMPLETED" as const,
  note: null,
}

const purchase = {
  ...transfer,
  id: "purchase",
  type: "PURCHASE" as const,
  from: null,
  to: { type: "WAREHOUSE" as const, id: "source", name: "المستودع المصدر" },
  counterparty: { id: "supplier", name: "المورد" },
  items: [{ id: "purchased", name: "مخزون الشراء", quantity: 10, type: "CONSUMABLE" as const, priceSource: null }],
}

describe("mounted location transfer history", () => {
  it("shows each item's own exact movement quantity and the other location", () => {
    mocks.history.mockReturnValue({
      data: { items: [transfer, purchase] },
      hasNextPage: false,
      isPending: false,
      isError: false,
    })

    render(<LocationTransferHistory locationId="source" locationType="WAREHOUSE" />)

    const [transferRow, purchaseRow] = screen.getAllByTestId("location-transfer-history-row")
    expect(transferRow).toBeTruthy()
    expect(purchaseRow).toBeTruthy()
    expect(within(transferRow!).getByText("×5")).toBeTruthy()
    expect(within(transferRow!).getByText("×0.000001")).toBeTruthy()
    expect(within(purchaseRow!).getByText("×10")).toBeTruthy()
    expect(transferRow?.textContent).toContain("إسمنت ×5")
    expect(transferRow?.textContent).toContain("مادة دقيقة ×0.000001")
    expect(transferRow?.textContent).toContain("مستودع الهدف")
    expect(transferRow?.textContent).toContain("صادر")
    expect(transferRow?.textContent).toContain("تحويل داخلي")
    expect(purchaseRow?.textContent).toContain("مخزون الشراء ×10")
  })
})
