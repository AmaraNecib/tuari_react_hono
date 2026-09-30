import { describe, expect, it } from "vitest"

import {
  isInstantWithinBounds,
  isInstantWithinDayRange,
  resolveDayRangeBounds,
} from "./date-range"

/**
 * The shared date-range boundary rule (#428 round 2): a range's end must
 * include the WHOLE picked day. These tests pin the inclusive Algeria bounds so
 * a record written at 23:59 on the picked end date is inside the range and a
 * record after midnight the next day is not.
 */

describe("resolveDayRangeBounds", () => {
  it("expands each picked day to its inclusive Algeria boundary", () => {
    expect(resolveDayRangeBounds({ fromDate: "2026-10-01", toDate: "2026-10-15" })).toEqual({
      // 00:00 Africa/Algiers (UTC+1) → 23:00 the previous UTC day.
      fromDate: "2026-09-30T23:00:00.000Z",
      // 23:59:59.999 Africa/Algiers → 22:59:59.999 UTC on the same day.
      toDate: "2026-10-15T22:59:59.999Z",
    })
  })

  it("leaves a blank side open", () => {
    expect(resolveDayRangeBounds({})).toEqual({ fromDate: undefined, toDate: undefined })
    expect(resolveDayRangeBounds({ toDate: "" })).toEqual({ fromDate: undefined, toDate: undefined })
    expect(resolveDayRangeBounds({ toDate: "2026-10-15" })).toEqual({
      fromDate: undefined,
      toDate: "2026-10-15T22:59:59.999Z",
    })
    expect(resolveDayRangeBounds({ fromDate: "2026-10-01" })).toEqual({
      fromDate: "2026-09-30T23:00:00.000Z",
      toDate: undefined,
    })
  })
})

/**
 * The helper only accepts canonical `yyyy-MM-dd` days, or a blank side. Anything
 * else is a caller bug that must fail loud: silently widening to an open range
 * or rolling an impossible day over to a different one would silently change
 * what the user asked for (and what the report shows).
 */
describe("resolveDayRangeBounds input contract", () => {
  it("rejects a legacy dd/MM/yyyy bound instead of silently opening the range", () => {
    expect(() => resolveDayRangeBounds({ toDate: "15/10/2026" })).toThrow(/canonical/i)
  })

  it("rejects an invalid calendar day instead of silently rolling it over", () => {
    expect(() => resolveDayRangeBounds({ toDate: "2026-02-30" })).toThrow(/canonical/i)
  })

  it("rejects an out-of-range month", () => {
    expect(() => resolveDayRangeBounds({ fromDate: "2026-13-01" })).toThrow(/canonical/i)
  })

  it("rejects an already-expanded instant so it cannot be double-expanded", () => {
    const once = resolveDayRangeBounds({ fromDate: "2026-10-01", toDate: "2026-10-15" })
    expect(() => resolveDayRangeBounds(once)).toThrow(/canonical/i)
  })
})

describe("isInstantWithinDayRange", () => {
  it("includes a log written at 23:59 on the picked end date", () => {
    expect(isInstantWithinDayRange("2026-10-15T22:59:00.000Z", { toDate: "2026-10-15" })).toBe(true)
  })

  it("includes the last millisecond of the picked end date", () => {
    expect(isInstantWithinDayRange("2026-10-15T22:59:59.999Z", { toDate: "2026-10-15" })).toBe(true)
  })

  it("excludes 00:00 at the start of the next day", () => {
    expect(isInstantWithinDayRange("2026-10-15T23:00:00.000Z", { toDate: "2026-10-15" })).toBe(false)
  })

  it("includes 00:00 on the picked start date", () => {
    expect(isInstantWithinDayRange("2026-09-30T23:00:00.000Z", { fromDate: "2026-10-01" })).toBe(true)
  })

  it("excludes the instant before the picked start date", () => {
    expect(isInstantWithinDayRange("2026-09-30T22:59:59.999Z", { fromDate: "2026-10-01" })).toBe(false)
  })

  it("treats both blank bounds as open", () => {
    expect(isInstantWithinDayRange("1999-01-01T00:00:00.000Z", {})).toBe(true)
  })

  it("rejects an unparsable instant", () => {
    expect(isInstantWithinDayRange("not-a-date", { fromDate: "2026-10-01" })).toBe(false)
  })

  it("refuses to evaluate an invalid day range rather than silently unbounding it", () => {
    expect(() =>
      isInstantWithinDayRange("2099-01-01T00:00:00.000Z", { toDate: "15/10/2026" }),
    ).toThrow(/canonical/i)
    expect(() =>
      isInstantWithinDayRange("2026-03-01T12:00:00.000Z", { toDate: "2026-02-30" }),
    ).toThrow(/canonical/i)
  })
})

describe("isInstantWithinBounds", () => {
  const bounds = resolveDayRangeBounds({ fromDate: "2026-10-01", toDate: "2026-10-15" })

  it("keeps the inclusive endpoints of pre-resolved bounds", () => {
    expect(isInstantWithinBounds("2026-09-30T23:00:00.000Z", bounds)).toBe(true)
    expect(isInstantWithinBounds("2026-10-15T22:59:59.999Z", bounds)).toBe(true)
  })

  it("excludes the instants outside pre-resolved bounds", () => {
    expect(isInstantWithinBounds("2026-09-30T22:59:59.999Z", bounds)).toBe(false)
    expect(isInstantWithinBounds("2026-10-15T23:00:00.000Z", bounds)).toBe(false)
  })
})
