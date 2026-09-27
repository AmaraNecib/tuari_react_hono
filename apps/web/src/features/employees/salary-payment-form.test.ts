import { describe, expect, it } from "vitest"

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import { computeUnallocatedDays, parsePositiveInteger, resolveSalaryPaymentPeriod } from "./salary-payment-form"

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
