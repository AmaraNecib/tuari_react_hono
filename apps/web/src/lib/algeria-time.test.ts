import { afterEach, beforeEach, describe, expect, it } from "vitest"

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
// 2026-09-30T23:00Z is 2026-10-01 00:00 in Africa/Algiers (UTC+1).
const MIDNIGHT_CROSSING = "2026-09-30T23:00:00.000Z"

const originalTimeZone = process.env.TZ

beforeEach(() => {
  process.env.TZ = "UTC"
})

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe("formatAlgeriaDate", () => {
  it("runs under UTC, so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
    expect(getAlgeriaTimeZone()).toBe("Africa/Algiers")
  })

  it("renders a stored instant on its Algeria day, not the ambient UTC day", () => {
    const algeriaDay = new Intl.DateTimeFormat("ar-DZ", {
      dateStyle: "medium",
      timeZone: "Africa/Algiers",
    }).format(new Date(MIDNIGHT_CROSSING))
    const utcDay = new Intl.DateTimeFormat("ar-DZ", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(MIDNIGHT_CROSSING))

    expect(algeriaDay).not.toBe(utcDay)
    expect(formatAlgeriaDate(MIDNIGHT_CROSSING)).toBe(algeriaDay)
    expect(formatAlgeriaDate(new Date(MIDNIGHT_CROSSING))).toBe(algeriaDay)
  })
})

describe("formatDateTimeInAlgeria", () => {
  it("renders the settings update-check instant in Africa/Algiers, not the ambient zone", () => {
    const algeriaStamp = new Intl.DateTimeFormat("ar-DZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Algiers",
    }).format(new Date(MIDNIGHT_CROSSING))
    const utcStamp = new Intl.DateTimeFormat("ar-DZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(MIDNIGHT_CROSSING))

    expect(algeriaStamp).not.toBe(utcStamp)
    expect(formatDateTimeInAlgeria(new Date(MIDNIGHT_CROSSING))).toBe(algeriaStamp)
  })
})

describe("getAlgeriaDateInputValue", () => {
  it("returns the Algeria calendar day for an instant near UTC midnight", () => {
    expect(getAlgeriaDateInputValue(new Date(MIDNIGHT_CROSSING))).toBe("2026-10-01")
  })
})
