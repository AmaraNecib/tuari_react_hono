import { describe, expect, it } from "vitest"

import {
  chargeAmountFromPercent,
  chargePercentFromAmount,
  parseChargeAmountInput,
} from "./transfer-item-dialog"

/**
 * Percentage ↔ amount linkage for a placement charge (#413). The dialog lets
 * the operator type either field; the two must stay consistent against the
 * unit's purchase price (negative = cut, positive = above).
 */
describe("placement charge amount ↔ percentage", () => {
  it("reports a cut as a negative percentage and an over-charge as positive", () => {
    expect(chargePercentFromAmount(100_000, 100_000)).toBe(0)
    expect(chargePercentFromAmount(80_000, 100_000)).toBe(-20)
    expect(chargePercentFromAmount(120_000, 100_000)).toBe(20)
  })

  it("converts a percentage back into an amount", () => {
    expect(chargeAmountFromPercent(0, 100_000)).toBe(100_000)
    expect(chargeAmountFromPercent(-20, 100_000)).toBe(80_000)
    expect(chargeAmountFromPercent(20, 100_000)).toBe(120_000)
    expect(chargeAmountFromPercent(-100, 100_000)).toBe(0)
  })

  it("round-trips an amount through the percentage when the percentage is exact", () => {
    for (const amount of [0, 50_000, 80_000, 100_000, 250_000]) {
      const percent = chargePercentFromAmount(amount, 100_000)
      expect(percent).not.toBeNull()
      expect(chargeAmountFromPercent(percent!, 100_000)).toBeCloseTo(amount, 2)
    }
  })

  it("returns no percentage when the purchase price is zero (division undefined)", () => {
    expect(chargePercentFromAmount(50_000, 0)).toBeNull()
    expect(chargePercentFromAmount(50_000, -1)).toBeNull()
  })

  it("treats a blank amount field as a free placement (0)", () => {
    expect(parseChargeAmountInput("")).toBe(0)
    expect(parseChargeAmountInput("   ")).toBe(0)
    expect(parseChargeAmountInput("0")).toBe(0)
    expect(parseChargeAmountInput("80000")).toBe(80_000)
    expect(parseChargeAmountInput("abc")).toBe(0)
    expect(parseChargeAmountInput("-5")).toBe(0)
  })
})
