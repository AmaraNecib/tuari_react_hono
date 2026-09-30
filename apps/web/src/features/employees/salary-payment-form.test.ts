import { describe, expect, it } from "vitest"

import { deriveSalaryProjectDays } from "@tuari/contracts"

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import { allocateSalaryAmountByDays, computeUnallocatedDays, defaultSalaryPaymentDays, parsePositiveInteger, resolveSalaryPaymentPeriod } from "./salary-payment-form"

describe("defaultSalaryPaymentDays", () => {
  it("defaults a full month for monthly and legacy weekly, and a single day for daily", () => {
    expect(defaultSalaryPaymentDays("MONTHLY")).toBe(30)
    expect(defaultSalaryPaymentDays("WEEKLY")).toBe(30)
    expect(defaultSalaryPaymentDays("DAILY")).toBe(1)
  })

  it("falls back to the month when the period is unknown", () => {
    expect(defaultSalaryPaymentDays(null)).toBe(30)
  })
})

describe("parsePositiveInteger", () => {
  it("parses a positive whole-day string", () => {
    expect(parsePositiveInteger(" 15 ")).toBe(15)
    expect(parsePositiveInteger("1")).toBe(1)
  })

  it("rejects zero, non-numeric, fractional, and negative input", () => {
    expect(parsePositiveInteger("0")).toBeNull()
    expect(parsePositiveInteger("")).toBeNull()
    expect(parsePositiveInteger("1.5")).toBeNull()
    expect(parsePositiveInteger("-3")).toBeNull()
    expect(parsePositiveInteger("days")).toBeNull()
  })

  it("rejects a day count past the safe-integer range", () => {
    // Digits-only parsing would otherwise turn a 20-digit string into 1e20 and
    // submit it straight to the cent arithmetic.
    expect(parsePositiveInteger("99999999999999999999")).toBeNull()
  })
})

describe("resolveSalaryPaymentPeriod", () => {
  it("covers the whole calendar month for a monthly payment", () => {
    expect(resolveSalaryPaymentPeriod("2026-03-15", "MONTHLY")).toEqual({
      start: toAlgeriaDayBoundaryIso("2026-03-01", "start"),
      end: toAlgeriaDayBoundaryIso("2026-03-31", "end"),
    })
  })

  it("uses the real month length (February, leap February)", () => {
    expect(resolveSalaryPaymentPeriod("2026-02-10", "MONTHLY")?.end).toBe(
      toAlgeriaDayBoundaryIso("2026-02-28", "end"),
    )
    expect(resolveSalaryPaymentPeriod("2028-02-10", "MONTHLY")?.end).toBe(
      toAlgeriaDayBoundaryIso("2028-02-29", "end"),
    )
  })

  it("covers a single day for a daily payment", () => {
    expect(resolveSalaryPaymentPeriod("2026-03-15", "DAILY")).toEqual({
      start: toAlgeriaDayBoundaryIso("2026-03-15", "start"),
      end: toAlgeriaDayBoundaryIso("2026-03-15", "end"),
    })
  })

  it("has no derived period for weekly (not offered) or an unknown period", () => {
    expect(resolveSalaryPaymentPeriod("2026-03-15", "WEEKLY")).toBeNull()
    expect(resolveSalaryPaymentPeriod("2026-03-15", null)).toBeNull()
  })

  it("returns null for an unparseable date", () => {
    expect(resolveSalaryPaymentPeriod("not-a-date", "MONTHLY")).toBeNull()
  })

  it("rejects rolled-over dates instead of naming a different period", () => {
    expect(resolveSalaryPaymentPeriod("2026-13-15", "MONTHLY")).toBeNull()
    expect(resolveSalaryPaymentPeriod("2026-00-10", "MONTHLY")).toBeNull()
    expect(resolveSalaryPaymentPeriod("2026-02-31", "MONTHLY")).toBeNull()
    expect(resolveSalaryPaymentPeriod("2026-02-29", "MONTHLY")).toBeNull()
    expect(resolveSalaryPaymentPeriod("2028-02-29", "MONTHLY")?.start).toBe(
      toAlgeriaDayBoundaryIso("2028-02-01", "start"),
    )
    expect(resolveSalaryPaymentPeriod("2026-03-00", "DAILY")).toBeNull()
  })
})

describe("resolveSalaryPaymentPeriod → deriveSalaryProjectDays seam", () => {
  it("scales a real 28-day February period to the payment's day count", () => {
    // The half-lines are tested with a 31-day March period; the production
    // February seam (28 real days scaled to a 30-day payment) was never
    // crossed end-to-end.
    const period = resolveSalaryPaymentPeriod("2026-02-10", "MONTHLY")
    expect(period).toEqual({
      start: toAlgeriaDayBoundaryIso("2026-02-01", "start"),
      end: toAlgeriaDayBoundaryIso("2026-02-28", "end"),
    })
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: period!.start, endDate: period!.end }],
        periodStart: period!.start,
        periodEnd: period!.end,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 30 }])
  })
})

describe("computeUnallocatedDays", () => {
  it("subtracts the allocated days from the paid days", () => {
    expect(computeUnallocatedDays(30, [20, 5])).toBe(5)
    expect(computeUnallocatedDays(30, [30])).toBe(0)
    expect(computeUnallocatedDays(30, [])).toBe(30)
  })

  it("goes negative when the split over-allocates", () => {
    expect(computeUnallocatedDays(10, [11])).toBe(-1)
  })

  it("returns null when the paid days are unknown", () => {
    expect(computeUnallocatedDays(null, [5])).toBeNull()
  })
})

describe("allocateSalaryAmountByDays", () => {
  it("prorates the paid amount by each line's share of the paid days", () => {
    expect(allocateSalaryAmountByDays(30000, [15, 15], 30)).toEqual([15000, 15000])
    expect(allocateSalaryAmountByDays(30000, [1, 29], 30)).toEqual([1000, 29000])
  })

  it("leaves the unallocated remainder's share unattributed", () => {
    // 25 of 30 days split between two projects: the lines carry only their
    // share, not the whole amount, and the unattributed share is not invented.
    const shares = allocateSalaryAmountByDays(30000, [15, 10], 30)
    expect(shares).toEqual([15000, 10000])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(25000)
  })

  it("distributes the rounding remainder so the shares sum to the paid amount", () => {
    // Three one-day lines of a 100 DZD payment: 33.33 each would total 99.99.
    const shares = allocateSalaryAmountByDays(100, [1, 1, 1], 3)
    expect(shares).toEqual([33.34, 33.33, 33.33])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 2)
  })

  it("hands the leftover cent to the line with the largest fractional part", () => {
    // Exact shares are 33.33…, 16.66…, and 50.00: the one leftover cent lands
    // on the middle line, not the first.
    const shares = allocateSalaryAmountByDays(100, [2, 1, 3], 6)
    expect(shares).toEqual([33.33, 16.67, 50])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 2)
  })

  it("returns zero shares instead of dividing by a non-positive day count", () => {
    expect(allocateSalaryAmountByDays(30000, [15, 15], 0)).toEqual([0, 0])
    expect(allocateSalaryAmountByDays(Number.NaN, [15, 15], 30)).toEqual([0, 0])
  })

  it("returns zero shares for a non-finite or fractional paid-day count", () => {
    // `NaN <= 0` is false, so a non-finite count used to fall through and make
    // every returned share NaN.
    expect(allocateSalaryAmountByDays(30000, [15, 15], Number.NaN)).toEqual([0, 0])
    expect(allocateSalaryAmountByDays(30000, [15, 15], 2.5)).toEqual([0, 0])
  })

  it("normalises an over-precise amount to whole cents before allocating", () => {
    // 100.005 has more precision than the currency: the shares must reconcile
    // to the two-decimal amount (100.01), not to 300 or to a partial total.
    const shares = allocateSalaryAmountByDays(100.005, [1, 1, 1], 3)
    expect(shares).toEqual([33.34, 33.34, 33.33])
    expect(shares.reduce((sum, share) => sum + Math.round(share * 100), 0)).toBe(10001)
  })
})
