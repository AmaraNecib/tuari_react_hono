import { describe, expect, it } from "vitest"
import { formatSalaryReferenceAmount } from "./exact-salary-reference-display"

describe("formatSalaryReferenceAmount", () => {
  it.each([
    ["2500.0000", true, "2,500"],
    ["2550.5000", true, "2,550.5"],
    ["2500.5500", true, "2,500.55"],
    ["2500.1234", true, "2,500.1234"],
    ["2500.1234", false, "2500.1234"],
  ])("formats %s with grouping=%s as %s", (amount, grouped, expected) => {
    expect(formatSalaryReferenceAmount({ period: "DAILY", amount }, grouped)).toBe(expected)
  })

  it("formats cash-period salary references without retaining insignificant cents", () => {
    expect(formatSalaryReferenceAmount({ period: "MONTHLY", amount: "2550.50" }, true)).toBe("2,550.5")
  })
})
