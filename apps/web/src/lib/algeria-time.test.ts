import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  ALGERIA_DAY,
  MIDNIGHT_CROSSING,
  UTC_DAY,
  dayIn,
  pinUtcTimeZone,
} from "@/test-utils/algeria-day"

import {
  formatAlgeriaDate,
  formatDateTimeInAlgeria,
  getAlgeriaDateInputValue,
  getAlgeriaTimeZone,
  isAlgeriaCalendarDay,
  toAlgeriaDayBoundaryIso,
} from "./algeria-time"

/**
 * Issue #473. A stored business day must render on its Africa/Algiers calendar
 * day regardless of the machine's timezone. The process is forced to UTC and
 * the fixture sits one hour before Algeria midnight, so an unpinned formatter
 * renders the previous day (2026-09-30) and the assertion fails.
 */
let restoreTimeZone: () => void

beforeEach(() => {
  restoreTimeZone = pinUtcTimeZone()
})

afterEach(() => {
  restoreTimeZone()
})

describe("formatAlgeriaDate", () => {
  it("runs under UTC, so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
    expect(getAlgeriaTimeZone()).toBe("Africa/Algiers")
    expect(ALGERIA_DAY).not.toBe(UTC_DAY)
  })

  it("renders a stored instant on its Algeria day, not the ambient UTC day", () => {
    expect(formatAlgeriaDate(MIDNIGHT_CROSSING)).toBe(ALGERIA_DAY)
    expect(formatAlgeriaDate(new Date(MIDNIGHT_CROSSING))).toBe(ALGERIA_DAY)
  })

  it("renders a bare yyyy-MM-dd business day on the same Algeria day", () => {
    expect(formatAlgeriaDate("2026-10-01")).toBe(dayIn("Africa/Algiers"))
  })
})

describe("formatDateTimeInAlgeria", () => {
  it("renders the settings update-check instant in Africa/Algiers, not the ambient zone", () => {
    const stampOptions = { dateStyle: "medium", timeStyle: "short" } as const

    expect(formatDateTimeInAlgeria(new Date(MIDNIGHT_CROSSING))).toBe(
      dayIn("Africa/Algiers", stampOptions),
    )
    expect(dayIn("Africa/Algiers", stampOptions)).not.toBe(dayIn("UTC", stampOptions))
  })
})

describe("getAlgeriaDateInputValue", () => {
  it("returns the Algeria calendar day for an instant near UTC midnight", () => {
    expect(getAlgeriaDateInputValue(new Date(MIDNIGHT_CROSSING))).toBe("2026-10-01")
  })
})

describe("toAlgeriaDayBoundaryIso", () => {
  it("expands a real day to the inclusive Algeria instant range", () => {
    expect(toAlgeriaDayBoundaryIso("2026-10-01", "start")).toBe("2026-09-30T23:00:00.000Z")
    expect(toAlgeriaDayBoundaryIso("2026-10-01", "end")).toBe("2026-10-01T22:59:59.999Z")
  })

  it("rejects 2026-02-30 instead of rolling it into March", () => {
    expect(toAlgeriaDayBoundaryIso("2026-02-30", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("2026-02-30", "end")).toBeUndefined()
  })

  it("rejects out-of-range month and day parts", () => {
    expect(toAlgeriaDayBoundaryIso("2026-13-01", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("2026-00-10", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("2026-04-31", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("2026-11-00", "start")).toBeUndefined()
  })

  it("keeps a leap day", () => {
    expect(toAlgeriaDayBoundaryIso("2028-02-29", "start")).toBe("2028-02-28T23:00:00.000Z")
  })

  it("rejects non-finite and malformed parts", () => {
    expect(toAlgeriaDayBoundaryIso("not-a-day", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("", "start")).toBeUndefined()
  })

  it("rejects a non-canonical string instead of coercing its leading digits", () => {
    // parseInt("15junk") is 15 and parseInt("01T00:00:00.000Z") is 1, so an
    // unanchored parse would accept these as a different day.
    expect(toAlgeriaDayBoundaryIso("2026-10-15junk", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("2026-10-01T00:00:00.000Z", "start")).toBeUndefined()
    expect(toAlgeriaDayBoundaryIso("2026-1a-05", "start")).toBeUndefined()
  })

  it("rejects a day past the end of its month", () => {
    expect(toAlgeriaDayBoundaryIso("2026-01-32", "start")).toBeUndefined()
  })
})

describe("isAlgeriaCalendarDay", () => {
  it("accepts canonical real days, including a leap day", () => {
    expect(isAlgeriaCalendarDay("2026-10-01")).toBe(true)
    expect(isAlgeriaCalendarDay("2028-02-29")).toBe(true)
  })

  it("rejects a non-canonical string without coercing it", () => {
    expect(isAlgeriaCalendarDay("2026-10-15junk")).toBe(false)
    expect(isAlgeriaCalendarDay("2026-10-01T00:00:00.000Z")).toBe(false)
    expect(isAlgeriaCalendarDay("2026-1-5")).toBe(false)
    expect(isAlgeriaCalendarDay("15/10/2026")).toBe(false)
    expect(isAlgeriaCalendarDay("")).toBe(false)
  })

  it("rejects an impossible day or out-of-range part", () => {
    expect(isAlgeriaCalendarDay("2026-02-30")).toBe(false)
    expect(isAlgeriaCalendarDay("2026-04-31")).toBe(false)
    expect(isAlgeriaCalendarDay("2026-13-01")).toBe(false)
    expect(isAlgeriaCalendarDay("2026-00-10")).toBe(false)
    expect(isAlgeriaCalendarDay("2026-11-00")).toBe(false)
  })
})
