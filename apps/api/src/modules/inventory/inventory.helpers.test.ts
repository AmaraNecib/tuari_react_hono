import { describe, expect, it } from "vitest"

import { addQuantity, normalizedQuantityMicroUnits, quantityDifferenceMatches, QUANTITY_MIN, roundQuantity, subtractQuantity } from "./inventory.helpers"

describe("roundQuantity (#450 round 4)", () => {
  it("snaps float noise while keeping fractional quantities", () => {
    // The equality the outbound write gate needs: a sum that misses 0.8 by one
    // float epsilon must round back to 0.8, not force integer cents.
    expect(roundQuantity(0.7 + 0.1)).toBe(0.8)
    expect(roundQuantity(0.3 - 0.1)).toBe(0.2)
    // A fully-consumed residual collapses to exactly zero, so the availability
    // predicate no longer offers the emptied balance as stock.
    expect(roundQuantity(0.1 - 0.09999999999999998)).toBe(0)
    // A genuine fractional remainder keeps its value.
    expect(roundQuantity(0.7 - 0.2)).toBe(0.5)
    expect(roundQuantity(1.234567)).toBe(1.234567)
    // The 6th decimal is the boundary, rounded half away from zero.
    expect(roundQuantity(1.2345678)).toBe(1.234568)
    expect(roundQuantity(5e-7)).toBe(1e-6)
  })

  it("preserves large values already at storage precision", () => {
    expect(roundQuantity(1_000_000_000_001)).toBe(1_000_000_000_001)
    expect(roundQuantity(999_999_999_999)).toBe(999_999_999_999)
  })

  it("is half away from zero for negatives and normalises -0", () => {
    expect(roundQuantity(-0.7 - 0.1)).toBe(-0.8)
    expect(roundQuantity(-5e-7)).toBe(-1e-6)
    // A value rounded away from nothing must compare equal to 0, not -0.
    expect(Object.is(roundQuantity(-4e-7), 0)).toBe(true)
  })

  it("leaves non-finite and scale-overflowing values representable", () => {
    expect(roundQuantity(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(roundQuantity(Number.NaN)).toBeNaN()
    // Exponential string forms and magnitudes whose scale overflows must not
    // turn into Infinity.
    expect(roundQuantity(1e-7)).toBe(0)
    expect(roundQuantity(1e21)).toBe(1e21)
    expect(roundQuantity(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })

  it("does exact decimal balance arithmetic and detects unrepresentable micro deltas", () => {
    expect(addQuantity(0.1, 0.2)).toBe(0.3)
    expect(subtractQuantity(0.3, 0.1)).toBe(0.2)
    expect(subtractQuantity(1_000_000_000_000, 1)).toBe(999_999_999_999)
    expect(quantityDifferenceMatches(1_000_000_000_000, 999_999_999_999, 1)).toBe(true)

    const largeBalanceRemainder = subtractQuantity(1_000_000_000_001, 0.0001)
    expect(largeBalanceRemainder).toBe(1_000_000_000_000.9999)
    expect(quantityDifferenceMatches(1_000_000_000_001, largeBalanceRemainder, 0.0001)).toBe(false)
  })

  it("converts normalized quantities to exact micro-units, including exponent notation", () => {
    expect(normalizedQuantityMicroUnits(8_589_934_592.000011)).toBe(8_589_934_592_000_011n)
    expect(normalizedQuantityMicroUnits(1e-6)).toBe(1n)
    expect(normalizedQuantityMicroUnits(-1.25)).toBe(-1_250_000n)
    expect(normalizedQuantityMicroUnits(0)).toBe(0n)
    expect(normalizedQuantityMicroUnits(roundQuantity(1e21))).toBe(1_000_000_000_000_000_000_000_000_000n)
    expect(normalizedQuantityMicroUnits(1e-7)).toBeNull()
    expect(normalizedQuantityMicroUnits(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("exposes the quantum that splits an empty balance from a held one", () => {
    expect(QUANTITY_MIN).toBe(1e-6)
    expect(roundQuantity(QUANTITY_MIN)).toBe(QUANTITY_MIN)
    expect(roundQuantity(QUANTITY_MIN / 10)).toBe(0)
  })
})
