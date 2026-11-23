/**
 * Small pure helpers shared by the report aggregators (InventoryService and
 * FinanceService) so monetary rounding, day math, and window resolution have
 * a single home and cannot drift between domains.
 */

import { MAX_MONEY_DZD } from "@tuari/contracts";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Round a monetary sum to 2 decimals so float noise never reaches the report UI.
 * The implementation lives in `@tuari/contracts` next to the money bound so the
 * API boundaries and the web percentage linkage share one copy; re-exported
 * here for the report aggregators that already import it from this module.
 */
export { roundMoney } from "@tuari/contracts";

/** Optional ISO-8601 report filter dates. */
export type ReportDateFilter = { startDate?: string; endDate?: string };

/**
 * Resolve the report window bounds plus the "as of" report date.
 *
 * Both bounds default to open (no filter). The report date is the endDate when
 * provided, otherwise "now" — it is the aging reference (and aging only); report
 * balances are always current-point-in-time, never reconstructed as-of endDate.
 */
export function resolveReportWindow(input: ReportDateFilter) {
  const startMs = input.startDate ? Date.parse(input.startDate) : Number.NEGATIVE_INFINITY;
  const endMs = input.endDate ? Date.parse(input.endDate) : Number.POSITIVE_INFINITY;
  const reportDateMs = Number.isFinite(endMs) ? endMs : Date.now();
  return { startMs, endMs, reportDateMs };
}

/** Whole days between a document date and the report date, clamped to ≥ 0. */
export function ageInDays(documentMs: number, reportDateMs: number) {
  return Math.max(0, Math.floor((reportDateMs - documentMs) / MS_PER_DAY));
}

/**
 * Refusal copy shared by every report aggregate guard (the owning module
 * supplies the typed error, see {@link accumulateReportMoney}).
 */
export const REPORT_MONEY_OVERFLOW_MESSAGE = `إجمالي التقرير يتجاوز الحد الأقصى المسموح به (${MAX_MONEY_DZD}).`;

/**
 * Add one stored money amount to a running report total, refusing a total the
 * safe-integer range cannot represent.
 *
 * A report is COMPUTED fresh at read time, so unlike a persisted money column
 * it may refuse to emit an unrepresentable value (the #429/F1=B contrast).
 * Each stored row reads back permissively, but a batch of individually-legal
 * rows can still sum past `MAX_MONEY_DZD` and would otherwise be emitted as a
 * silently wrong number (— or fail output validation with a generic 500).
 * `onOverflow` lets the owning module raise its own typed BUSINESS_RULE error
 * (InventoryError / CompanyError) while the arithmetic rule lives here once.
 */
export function accumulateReportMoney(
  currentDzd: number,
  amountDzd: number,
  onOverflow: () => never,
): number {
  const nextDzd = currentDzd + amountDzd;
  // `nextDzd > MAX_MONEY_DZD` alone is not enough near the bound: a small
  // fraction added to a total already at MAX rounds the sum back to MAX (the
  // double spacing at 2^53 is 1), so the fraction would be silently dropped
  // instead of refused. Compare the increment against the remaining headroom,
  // which is exact while `currentDzd <= MAX_MONEY_DZD`. The finiteness check
  // still catches NaN/Infinity that the comparison cannot.
  if (!Number.isFinite(nextDzd) || amountDzd > MAX_MONEY_DZD - currentDzd) {
    onOverflow();
  }
  return nextDzd;
}
