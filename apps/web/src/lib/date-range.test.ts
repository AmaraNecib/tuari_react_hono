import { describe, expect, it } from "vitest"

import { isInstantWithinDayRange, resolveDayRangeBounds } from "./date-range"

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
})
