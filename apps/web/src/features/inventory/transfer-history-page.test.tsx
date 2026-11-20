import "@/i18n"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TransferHistoryPage } from "./transfer-history-page"
const mocks = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock("./transfer-history-hooks", () => ({ useTransferHistoryQuery: () => mocks.history() }))
afterEach(cleanup)
describe("transfer history exact display", () => {
  it.each(["00", "01"])("renders a wide aggregate with cents %s and actual history rows", cents => {
    mocks.history.mockReturnValue({ data: { items: ["60000000000000000.00", `60000000000000000.${cents}`].map((totalAmountDzd, id) => ({
      id: String(id), date: "2026-11-10T10:00:00.000Z", type: "SALE", from: null, to: null, counterparty: null,
      items: [], totalAmountDzd, paidAmountDzd: "0.00", remainingDebtDzd: totalAmountDzd, currency: "DZD", paymentStatus: "UNPAID", status: "COMPLETED", note: null,
    })) }, isPending: false, isError: false })
    render(<TransferHistoryPage />)
    expect(screen.getByText(`120,000,000,000,000,000${cents === "00" ? "" : ".01"}`)).toBeTruthy()
    expect(screen.getAllByText(`60,000,000,000,000,000${cents === "00" ? "" : ".01"}`).length).toBeGreaterThan(0)
  })
})
