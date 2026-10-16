/**
 * Algeria timezone utilities for date handling.
 *
 * Africa/Algiers is UTC+1 year-round (no DST). A stored business day must be
 * rendered in this zone: the machine's zone is not the business zone, and an
 * instant near midnight would otherwise render the previous day.
 */
const ALGERIA_TIME_ZONE = "Africa/Algiers"
const ALGERIA_OFFSET_HOURS = 1

/**
 * Expand a `yyyy-MM-dd` business day to the inclusive UTC instant range of that
 * day in Africa/Algiers (`start` = 00:00 local, `end` = 23:59:59.999 local).
 * Returns `undefined` when the value is not a valid calendar day.
 */
export function toAlgeriaDayBoundaryIso(value: string, boundary: "start" | "end") {
  const [rawYear, rawMonth, rawDay] = value.split("-").map((part) => Number.parseInt(part, 10))
  const year = rawYear ?? Number.NaN
  const month = rawMonth ?? Number.NaN
  const day = rawDay ?? Number.NaN

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return undefined
  }

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
 * day. Accepts the stored value directly — an instant string or a `Date`.
 */
export function formatAlgeriaDate(value: string | Date, locale = "ar-DZ") {
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: ALGERIA_TIME_ZONE,
  }).format(date)
}

/** The app's business timezone, for formatters that take their own options. */
export function getAlgeriaTimeZone() {
  return ALGERIA_TIME_ZONE
}
