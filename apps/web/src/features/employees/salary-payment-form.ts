/**
 * Pure helpers for the salary-payment form (issue #412).
 *
 * Kept out of the component so the pay-period boundaries and the unallocated
 * remainder can be unit-tested without rendering.
 */
import { roundMoneyToCents, SALARY_DAYS_PER_MONTH } from "@tuari/contracts"
import type { SalaryPeriodType } from "@tuari/contracts"

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

export { roundMoneyToCents, SALARY_DAYS_PER_MONTH }

/**
 * The default day count for a new payment.
 *
 * MONTHLY and legacy WEEKLY default to a full 30-day month; DAILY defaults to a
 * single day. A daily wage is paid per day, so defaulting it to a 30-day month
 * would propose a month's pay for one day's work. Both payment surfaces (the
 * salaries dialog and the employee-details quick form) must agree, so they
 * share this helper. A null period (unknown) falls back to the month.
 */
export function defaultSalaryPaymentDays(periodType: SalaryPeriodType | null): number {
  return periodType === "DAILY" ? 1 : SALARY_DAYS_PER_MONTH
}

/** Parse a positive whole-day string, or null when it is not one. */
export function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const parsed = Number(trimmed)
  // A 20-digit entry parses to a finite, integer-looking 1e20 whose cent
  // arithmetic overflows; only a safe integer is a real day count.
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * The pay period a payment on `dateValue` covers.
 *
 * MONTHLY covers the whole calendar month; DAILY covers the single day.
 * WEEKLY is not offered and returns null (no derived default).
 */
export function resolveSalaryPaymentPeriod(
  dateValue: string,
  periodType: SalaryPeriodType | null,
): { start: string; end: string } | null {
  const parts = dateValue.split("-").map((part) => Number.parseInt(part, 10))
  const [year, month, day] = [parts[0] ?? Number.NaN, parts[1] ?? Number.NaN, parts[2] ?? Number.NaN]

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  // Reject rolled-over dates (`2026-13-15`, `2026-02-31`) instead of silently
  // producing a different period: only a real calendar date names a pay period.
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) {
    return null
  }

  if (periodType === "MONTHLY") {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const start = toAlgeriaDayBoundaryIso(`${year}-${pad(month)}-01`, "start")
    const end = toAlgeriaDayBoundaryIso(`${year}-${pad(month)}-${pad(lastDay)}`, "end")
    return start && end ? { start, end } : null
  }

  if (periodType === "DAILY") {
    const start = toAlgeriaDayBoundaryIso(dateValue, "start")
    const end = toAlgeriaDayBoundaryIso(dateValue, "end")
    return start && end ? { start, end } : null
  }

  return null
}

/**
 * Days left unallocated: the paid days minus the split lines.
 *
 * A negative value means the split over-allocates and must be blocked before
 * submit; a positive value is the remainder that stays unallocated.
 */
export function computeUnallocatedDays(
  days: number | null,
  splitDays: readonly number[],
): number | null {
  if (days === null) {
    return null
  }

  return splitDays.reduce((remaining, lineDays) => remaining - lineDays, days)
}

/**
 * The share of a paid amount attributed to each split line.
 *
 * A split stores only its days, so each line's amount is prorated against the
 * whole payment: a line of 15 of 30 paid days carries half the paid amount, and
 * the unallocated remainder's share is deliberately left unattributed. Allocating
 * each line independently loses the rounding remainder (three one-day lines of a
 * 100 DZD payment round to 33.33 each, 99.99 total), so the cents are
 * distributed by largest remainder (largest-remainder/Hamilton, the same
 * approach `deriveSalaryProjectDays` uses): every line is floored to whole cents
 * and the leftover cents go to the lines with the largest fractional part. The
 * returned amounts therefore sum EXACTLY to the rounded attributed portion of the
 * payment, which is the whole amount when the split covers every paid day. Ties
 * are broken by line order so the result is deterministic. The amount is
 * normalised to whole cents first, so it cannot disagree with the stored amount
 * when an override carried more than two decimals.
 */
export function allocateSalaryAmountByDays(
  amountDzd: number,
  splitDays: readonly number[],
  totalDays: number,
): number[] {
  if (!Number.isFinite(amountDzd) || !Number.isInteger(totalDays) || totalDays <= 0) {
    return splitDays.map(() => 0)
  }

  const amountCents = Math.round(amountDzd * 100)
  const allocatedDays = splitDays.reduce((sum, lineDays) => sum + lineDays, 0)
  const attributedCents = Math.round((amountCents * allocatedDays) / totalDays)
  const exactCents = splitDays.map((lineDays) => (amountCents * lineDays) / totalDays)
  const flooredCents = exactCents.map((cents) => Math.floor(cents))
  const remainingCents = attributedCents - flooredCents.reduce((sum, cents) => sum + cents, 0)

  const byRemainder = exactCents
    .map((cents, index) => ({ index, fraction: cents - Math.floor(cents) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
  const bonusIndices = new Set(byRemainder.slice(0, remainingCents).map((line) => line.index))

  return flooredCents.map((cents, index) => (cents + (bonusIndices.has(index) ? 1 : 0)) / 100)
}
