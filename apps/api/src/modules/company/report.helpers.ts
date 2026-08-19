/**
 * Small pure helpers shared by the report aggregators (InventoryService and
 * FinanceService) so monetary rounding, day math, and window resolution have
 * a single home and cannot drift between domains.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Round a monetary sum to 2 decimals so float noise never reaches the report UI. */
export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

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
