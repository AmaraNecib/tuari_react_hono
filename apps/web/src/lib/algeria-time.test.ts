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
