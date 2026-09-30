import { toAlgeriaDayBoundaryIso } from "./algeria-time"

/**
 * A day-range selection as held by the screens: canonical `yyyy-MM-dd` days
 * (what `DatePicker` / `DateRangeFilter` emit). A blank side is an open bound.
 */
export type DayRangeSelection = {
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
 */
export function resolveDayRangeBounds(range: DayRangeSelection): DayRangeSelection {
  return {
    fromDate: range.fromDate ? toAlgeriaDayBoundaryIso(range.fromDate, "start") : undefined,
    toDate: range.toDate ? toAlgeriaDayBoundaryIso(range.toDate, "end") : undefined,
  }
}

/**
 * Whether an ISO instant falls inside the inclusive day range. A record at
 * 23:59 on the end day is in; 00:00 the next day is out. A blank bound is
 * open, and an unparsable instant is out of range.
 */
export function isInstantWithinDayRange(timestamp: string, range: DayRangeSelection): boolean {
  const at = Date.parse(timestamp)
  if (!Number.isFinite(at)) return false

  const { fromDate, toDate } = resolveDayRangeBounds(range)
  if (fromDate && at < Date.parse(fromDate)) return false
  if (toDate && at > Date.parse(toDate)) return false
  return true
}
