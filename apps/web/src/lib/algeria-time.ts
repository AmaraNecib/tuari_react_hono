/**
 * Algeria timezone utilities for date handling.
 *
 * Africa/Algiers is UTC+1 year-round (no DST). A stored business day must be
 * rendered in this zone: the machine's zone is not the business zone, and an
 * instant near midnight would otherwise render the previous day.
 */
const ALGERIA_TIME_ZONE = "Africa/Algiers"
const ALGERIA_OFFSET_HOURS = 1

/** Canonical stored business day: zero-padded `yyyy-MM-dd` and nothing else. */
const CANONICAL_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Whether `value` is a canonical `yyyy-MM-dd` day that exists on the calendar.
 *
 * The pattern alone is not enough: `2026-02-30` matches it but is not a day,
 * and `Date.UTC` would roll it over to `2026-03-02`. The round-trip rejects the
 * rollover. This is the single statement of the canonical-day rule; callers
 * that must fail loudly (`date-range.ts`) throw on top of it.
 */
export function isAlgeriaCalendarDay(value: string): boolean {
  const match = CANONICAL_DAY_PATTERN.exec(value)
  if (!match) {
    return false
  }

  const year = Number.parseInt(match[1]!, 10)
  const month = Number.parseInt(match[2]!, 10)
  const day = Number.parseInt(match[3]!, 10)
  const midnightUtc = new Date(Date.UTC(year, month - 1, day))
  return (
    midnightUtc.getUTCFullYear() === year &&
    midnightUtc.getUTCMonth() === month - 1 &&
    midnightUtc.getUTCDate() === day
  )
}

/**
 * Expand a `yyyy-MM-dd` business day to the inclusive UTC instant range of that
 * day in Africa/Algiers (`start` = 00:00 local, `end` = 23:59:59.999 local).
 * Returns `undefined` for anything that is not a real calendar day: a
 * non-canonical string or a rolling value like `2026-02-30`.
 */
export function toAlgeriaDayBoundaryIso(value: string, boundary: "start" | "end") {
  if (!isAlgeriaCalendarDay(value)) {
    return undefined
  }

  const [rawYear, rawMonth, rawDay] = value.split("-")
  const year = Number.parseInt(rawYear!, 10)
  const month = Number.parseInt(rawMonth!, 10)
  const day = Number.parseInt(rawDay!, 10)

  return boundary === "start"
    ? new Date(Date.UTC(year, month - 1, day, 0 - ALGERIA_OFFSET_HOURS, 0, 0, 0)).toISOString()
    : new Date(Date.UTC(year, month - 1, day, 23 - ALGERIA_OFFSET_HOURS, 59, 59, 999)).toISOString()
}

/**
 * The app's canonical business day (`yyyy-MM-dd`) for `date`, in Africa/Algiers.
 */
export function getAlgeriaDateInputValue(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ALGERIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/**
 * Format a stored instant as a date and time in Africa/Algiers.
 */
export function formatDateTimeInAlgeria(date: Date, locale = "ar-DZ") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ALGERIA_TIME_ZONE,
  }).format(date)
}

/**
 * Format a stored business day as the Algeria calendar day it fell on (date
 * only), pinned to Africa/Algiers so a UTC midnight boundary cannot shift the
 * day. Accepts the stored value directly — an instant string or a `Date` — and
 * returns `—` for a value that is not a parsable date.
 */
export function formatAlgeriaDate(value: string | Date, locale = "ar-DZ") {
  const date = typeof value === "string" ? new Date(value) : value
  // `Intl.DateTimeFormat.format` throws a RangeError on an invalid date, where
  // the `toLocaleDateString` this replaced rendered the string "Invalid Date".
  // A truthy-but-unparsable stored value must degrade to a placeholder, not
  // unmount the screen.
  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: ALGERIA_TIME_ZONE,
  }).format(date)
}

/** The app's business timezone, for formatters that take their own options. */
export function getAlgeriaTimeZone() {
  return ALGERIA_TIME_ZONE
}
