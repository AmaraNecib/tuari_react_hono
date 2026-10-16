import { describe, expect, it } from "vitest"

import { roundQuantity } from "./inventory.helpers"

describe("roundQuantity (#450 round 4)", () => {
  it("snaps float noise while keeping fractional quantities", () => {
    // The equality the outbound write gate needs: a sum that misses 0.8 by one
    // float epsilon must round back to 0.8, not force integer cents.
    expect(roundQuantity(0.7 + 0.1)).toBe(0.8)
    expect(roundQuantity(0.3 - 0.1)).toBe(0.2)
    // A fully-consumed residual collapses to exactly zero, so `quantity > 0` no
    // longer offers the emptied balance as stock.
    expect(roundQuantity(0.1 - 0.09999999999999998)).toBe(0)
    // A genuine fractional remainder keeps its value.
    expect(roundQuantity(0.7 - 0.2)).toBe(0.5)
    expect(roundQuantity(1.234567)).toBe(1.234567)
  })

  it("leaves non-finite and scale-overflowing values representable", () => {
    expect(roundQuantity(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(roundQuantity(Number.NaN)).toBeNaN()
    // Exponential string forms and magnitudes whose scale overflows must not
    // turn into Infinity.
    expect(roundQuantity(1e-7)).toBe(0)
    expect(roundQuantity(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })
})
