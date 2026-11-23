import { describe, expect, it } from "vitest"

import { roundMoney } from "./report.helpers"

describe("roundMoney", () => {
  it("rounds float noise to the cent", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(1.1 * 3)).toBe(3.3)
  })

  it("keeps large totals exact instead of corrupting them through value * 100", () => {
    // Above MAX_SAFE_INTEGER / 100 the multiply overflows IEEE-754 integer
    // precision; the old helper returned MAX - 2 for an input of MAX - 1.
    const max = Number.MAX_SAFE_INTEGER

    expect(roundMoney(max)).toBe(max)
    expect(roundMoney(max - 1)).toBe(max - 1)
    expect(roundMoney(-(max - 1))).toBe(-(max - 1))
  })
})
