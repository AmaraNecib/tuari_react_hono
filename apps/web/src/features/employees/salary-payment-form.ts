/**
 * Pure helpers for the salary-payment form (issue #412).
 *
 * Kept out of the component so the pay-period boundaries and the unallocated
 * remainder can be unit-tested without rendering.
 */
import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

export type SalaryPaymentPeriodType = "DAILY" | "WEEKLY" | "MONTHLY"

/** The day the monthly rate treats as a full month (issue #412). */
export const SALARY_DAYS_PER_MONTH = 30

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
  periodType: SalaryPaymentPeriodType | null,
): { start: string; end: string } | null {
  const parts = dateValue.split("-").map((part) => Number.parseInt(part, 10))
  const [year, month, day] = [parts[0] ?? Number.NaN, parts[1] ?? Number.NaN, parts[2] ?? Number.NaN]

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
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
