/**
 * Independent worked examples for the stored instant at Algeria midnight.
 * Presentation follows #534; timezone and canonical-value contracts are unchanged.
 */
export const MIDNIGHT_CROSSING = "2026-09-30T23:00:00.000Z"

export function dayIn(timeZone: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = timeZone === "Africa/Algiers" ? "01/10/2026" : "30/09/2026"
  if (options.timeStyle) return date + (timeZone === "Africa/Algiers" ? " 12:00 ص" : " 11:00 م")
  return date
}

export const ALGERIA_DAY = "01/10/2026"
export const UTC_DAY = "30/09/2026"
export const ALGERIA_DAY_SHORT = ALGERIA_DAY
export const UTC_DAY_SHORT = UTC_DAY
export const ALGERIA_DAY_LONG = ALGERIA_DAY
export const UTC_DAY_LONG = UTC_DAY

/** Pin the machine timezone without changing the application's business timezone. */
export function pinUtcTimeZone(): () => void {
  const original = process.env.TZ
  process.env.TZ = "UTC"
  return () => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}
