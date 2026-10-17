import { isAlgeriaCalendarDay, toAlgeriaDayBoundaryIso } from "./algeria-time"

/**
 * A day-range selection as held by the screens: canonical `yyyy-MM-dd` days
 * (what `DatePicker` / `DateRangeFilter` emit). A blank side is an open bound.
 */
export type DayRangeSelection = {
  fromDate?: string
  toDate?: string
}

/**
 * Inclusive ISO-8601 instant bounds expanded from a {@link DayRangeSelection}.
 * Deliberately a distinct type from the selection: these are instants, not
 * days, and must not be fed back into {@link resolveDayRangeBounds}.
 */
export type DayRangeInstantBounds = {
  fromDate?: string
  toDate?: string
}

/**
 * Expand a pair of canonical days into the inclusive instant bounds a range
 * consumer queries with.
 *
 * A range's end must include the whole picked day, so the upper bound is the
 * day's END in Africa/Algiers (`…T22:59:59.999Z`), never the bare day:
 * `new Date("2026-10-15")` is UTC midnight and would silently drop every
 * record written after 00:00 on the picked end date. The lower bound is the
 * day's start (`00:00` Algeria). A blank side stays `undefined`.
 *
 * A non-blank side that is not a valid canonical day throws: silently widening
 * to an open range (a `dd/MM/yyyy` or garbage string) or rolling an impossible
 * day over to a different one would silently change what the user asked for.
 * Pass canonical days only, and never pass this function's own output back in.
 */
export function resolveDayRangeBounds(range: DayRangeSelection): DayRangeInstantBounds {
  return {
    fromDate: resolveBound(range.fromDate, "start"),
    toDate: resolveBound(range.toDate, "end"),
  }
}

function resolveBound(day: string | undefined, boundary: "start" | "end"): string | undefined {
  if (!day) return undefined
  if (!isAlgeriaCalendarDay(day)) {
    throw new Error(
      `resolveDayRangeBounds expects a canonical yyyy-MM-dd day or a blank value, received "${day}"`,
    )
  }
  return toAlgeriaDayBoundaryIso(day, boundary)
}

/**
 * Whether an ISO instant falls inside pre-resolved inclusive instant bounds.
 * A blank bound is open, and an unparsable instant is out of range. Resolve
 * the bounds once (with {@link resolveDayRangeBounds}) and reuse them when
 * filtering many rows.
 */
export function isInstantWithinBounds(timestamp: string, bounds: DayRangeInstantBounds): boolean {
  const at = Date.parse(timestamp)
  if (!Number.isFinite(at)) return false

  if (bounds.fromDate && at < Date.parse(bounds.fromDate)) return false
  if (bounds.toDate && at > Date.parse(bounds.toDate)) return false
  return true
}

/**
 * Whether an ISO instant falls inside the inclusive day range. A record at
 * 23:59 on the end day is in; 00:00 the next day is out. A blank bound is
 * open, and an unparsable instant is out of range. An invalid range throws.
 */
export function isInstantWithinDayRange(timestamp: string, range: DayRangeSelection): boolean {
  return isInstantWithinBounds(timestamp, resolveDayRangeBounds(range))
}
