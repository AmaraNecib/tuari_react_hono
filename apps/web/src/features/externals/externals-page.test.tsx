import "@/i18n"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DEBT_BALANCE_STATE_PHRASE } from "@tuari/contracts"
import { ExternalCounterpartiesPage } from "./externals-page"
afterEach(cleanup)
describe("external balances exact display", () => {
  it.each([
    ["-120000000000000000.01", "120,000,000,000,000,000.01", DEBT_BALANCE_STATE_PHRASE.owedByUs],
    ["120000000000000000.00", "120,000,000,000,000,000", DEBT_BALANCE_STATE_PHRASE.owedToUs],
    ["0.00", "0", DEBT_BALANCE_STATE_PHRASE.settled],
  ])("renders wide net %s with its actual direction label", (totalBalanceDzd, amount, phrase) => {
    render(<ExternalCounterpartiesPage counterparties={[{ id: "supplier", fullName: "Supplier", note: null, phone: "", totalAccountCount: 2, openAccountCount: 2, totalBalanceDzd }]} onCreate={() => {}} onOpen={() => {}} />)
    expect(screen.getByText(amount)).toBeTruthy()
    expect(screen.getByText(phrase)).toBeTruthy()
  })
})
