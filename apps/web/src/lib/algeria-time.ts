/**
 * Algeria timezone utilities for date handling.
 */
const ALGERIA_TIME_ZONE = "Africa/Algiers"
const ALGERIA_OFFSET_HOURS = 1

/**
 * toAlgeriaDayBoundaryIso(value component.
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
/**
 * getAlgeriaDateInputValue(date = new Date()) component.
 */
    : new Date(Date.UTC(year, month - 1, day, 23 - ALGERIA_OFFSET_HOURS, 59, 59, 999)).toISOString()
}

export function getAlgeriaDateInputValue(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ALGERIA_TIME_ZONE,
/**
 * formatDateTimeInAlgeria(date component.
 */
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}
/**
 * getAlgeriaTimeZone() component.
 */

export function formatDateTimeInAlgeria(date: Date, locale = "ar-DZ") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ALGERIA_TIME_ZONE,
  }).format(date)
}

/**
 * Format a stored instant as the Algeria calendar day it fell on (date only),
 * pinned to Africa/Algiers so a UTC midnight boundary cannot shift the day.
 */
export function formatAlgeriaDate(date: Date, locale = "ar-DZ") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: ALGERIA_TIME_ZONE,
  }).format(date)
}

export function getAlgeriaTimeZone() {
  return ALGERIA_TIME_ZONE
}
