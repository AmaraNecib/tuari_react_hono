/**
 * Shared test fixtures for issue #473: every stored business day must render on
 * its Africa/Algiers calendar day. `MIDNIGHT_CROSSING` is exactly Algeria
 * midnight of the next Algeria day (2026-10-01), so an unpinned formatter under
 * a non-Algerian zone renders the previous day and the assertion fails.
 */
// 2026-09-30T23:00Z is 2026-10-01 00:00 in Africa/Algiers (UTC+1).
export const MIDNIGHT_CROSSING = "2026-09-30T23:00:00.000Z"

const SHORT_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }
const LONG_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }

export function dayIn(
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat("ar-DZ", { ...options, timeZone }).format(new Date(MIDNIGHT_CROSSING))
}

export const ALGERIA_DAY = dayIn("Africa/Algiers")
export const UTC_DAY = dayIn("UTC")
export const ALGERIA_DAY_SHORT = dayIn("Africa/Algiers", SHORT_OPTIONS)
export const UTC_DAY_SHORT = dayIn("UTC", SHORT_OPTIONS)
export const ALGERIA_DAY_LONG = dayIn("Africa/Algiers", LONG_OPTIONS)
export const UTC_DAY_LONG = dayIn("UTC", LONG_OPTIONS)

/**
 * Force the process timezone to UTC for the current test and return a restore
 * function. Node re-reads `process.env.TZ`, so formatters created after this
 * call resolve UTC; the restore keeps sibling suites in the worker unaffected.
 */
export function pinUtcTimeZone(): () => void {
  const original = process.env.TZ
  process.env.TZ = "UTC"
  return () => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}
