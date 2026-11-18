import { describe, expect, it } from "vitest"

import { calculateEarningAllocation, suggestBlankEarningRowAmounts } from "./employee-earning-allocation"

describe("earned-wage allocation calculations", () => {
  it("derives the exact remainder from total minus ordered manual amounts", () => {
    const summary = calculateEarningAllocation("62,500.01", [
      { id: "a1", daysText: "5", amountText: "10,000" },
      { id: "b", daysText: "15", amountText: "37,500" },
      { id: "a2", daysText: "5", amountText: "15,000" },
    ])

    expect(summary).toEqual({ totalMinor: 6_250_001n, allocatedMinor: 6_250_000n, remainderMinor: 1n })
  })

  it("keeps over-allocation negative and marks missing or invalid money as unknown", () => {
    expect(calculateEarningAllocation("", []).remainderMinor).toBeNull()
    expect(calculateEarningAllocation("10", [{ id: "a", daysText: "1", amountText: "11" }]).remainderMinor).toBe(-100n)
    expect(calculateEarningAllocation("10", [{ id: "a", daysText: "1", amountText: "1.001" }]).remainderMinor).toBeNull()
    expect(calculateEarningAllocation("1.001", []).remainderMinor).toBeNull()
  })

  it("keeps blank row amounts unknown rather than presenting an entered zero", () => {
    for (const amountText of ["", "   "]) {
      expect(calculateEarningAllocation("10", [{ id: "a", daysText: "1", amountText }]))
        .toEqual({ totalMinor: 1000n, allocatedMinor: null, remainderMinor: null })
    }
    expect(calculateEarningAllocation("10", [{ id: "a", daysText: "1", amountText: "0" }]))
      .toEqual({ totalMinor: 1000n, allocatedMinor: 0n, remainderMinor: 1000n })
    expect(calculateEarningAllocation("10", []))
      .toEqual({ totalMinor: 1000n, allocatedMinor: 0n, remainderMinor: 1000n })
  })

  it("suggests exact weighted values only for blank rows and preserves manual amounts", () => {
    const suggestions = suggestBlankEarningRowAmounts("100.01", [
      { id: "manual", daysText: "3", amountText: "0.01" },
      { id: "first", daysText: "1", amountText: "" },
      { id: "second", daysText: "2", amountText: "" },
    ])

    expect(suggestions).toEqual([
      { id: "first", amountText: "33.33" },
      { id: "second", amountText: "66.67" },
    ])
  })

  it("breaks an equal fractional-cent tie by the existing row order", () => {
    expect(suggestBlankEarningRowAmounts("0.01", [
      { id: "first", daysText: "1", amountText: "" },
      { id: "second", daysText: "1", amountText: "" },
    ])).toEqual([{ id: "first", amountText: "0.01" }, { id: "second", amountText: "0.00" }])
  })

  it("does not suggest when money, remaining value, or blank-row day weights are invalid", () => {
    expect(suggestBlankEarningRowAmounts("1", [{ id: "a", daysText: "0", amountText: "" }])).toBeNull()
    expect(suggestBlankEarningRowAmounts("1", [{ id: "a", daysText: "1", amountText: "1" }])).toBeNull()
    expect(suggestBlankEarningRowAmounts("1", [{ id: "a", daysText: "1", amountText: "1.001" }])).toBeNull()
  })
})
