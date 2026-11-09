import { describe, expect, it } from "vitest"
import { parseDebtAmount, resolveDebtPaymentAction } from "./debt-payment"

describe("debt amount input", () => {
  it.each([
    ["2500", 2500], ["2500.50", 2500.5], ["2 500.50", 2500.5],
    ["2,500.50", 2500.5], ["٢٬٥٠٠٫٥٠", 2500.5], ["٢٥٠٠٫٥٠", 2500.5],
    ["۲ ۵۰۰.۵۰", 2500.5], ["2\u00a0500.50", 2500.5], ["2\u202f500.50", 2500.5],
    ["  -2 500.50  ", -2500.5], ["+500", 500], ["0.01", 0.01], ["0", 0],
  ])("parses %s without rounding or changing its magnitude", (input, expected) => {
    expect(parseDebtAmount(input)).toBe(expected)
  })

  it.each(["", "25 00.50", "2,50,0", "2,500 000", "2  500", "25abc", "1e3", "0x10", "Infinity", "1.234", "1,50", "1.2.3", "1\n000", "9007199254740991"])(
    "rejects malformed or unsafe input %s instead of guessing", (input) => {
      expect(parseDebtAmount(input)).toBeNull()
    },
  )
})

describe("debt payment action", () => {
  it.each(["PAYABLE", "RECEIVABLE"] as const)("reduces the selected %s account with a PAYMENT entry", (direction) => {
    const account = { id: "account-1", direction, currentBalance: 22500.5 }
    expect(resolveDebtPaymentAction(account, "2 500.50")).toEqual({
      input: { debtAccountId: "account-1", entryType: "PAYMENT", signedAmountDzd: -2500.5 },
      amountDzd: 2500.5,
      balanceAfterDzd: 20000,
    })
  })

  it("keeps the cases-form reducing-movement rule on a credited ledger", () => {
    expect(resolveDebtPaymentAction({ id: "credit", currentBalance: -700 }, "-200")?.balanceAfterDzd).toBe(-900)
  })

  it.each(["", "0", "0.00", "25 00.50"])("does not create a payment for %s", (amount) => {
    expect(resolveDebtPaymentAction({ id: "account-1", currentBalance: 5000 }, amount)).toBeNull()
  })
})
