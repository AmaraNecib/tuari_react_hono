/**
 * Salary proration and per-project split helpers (issue #412).
 *
 * These are pure functions shared by the API service and the web payment
 * form so the proposed amount and the derived calendar-day default cannot
 * drift between the two.
 *
 * Conventions:
 * - A "day" is a whole day. The business pays per whole day; half days and
 *   the day-before-Friday penalty arithmetic are explicitly out of scope,
 *   so `days` is always a positive integer.
 * - The monthly day rate is `salaryAmountDzd / 30`, identical in February and
 *   in March (issue #412).
 * - `WEEKLY` remains in the period enum (legacy rows and code paths), but is
 *   not offered in the UI and is not prorated: it keeps the raw salary.
 */

export type SalaryPeriodType = "DAILY" | "WEEKLY" | "MONTHLY";

export type SalaryProjectAssignmentWindow = {
  projectId: string;
  startDate: string;
  endDate: string | null;
};

export type SalaryProjectDaySplit = {
  projectId: string;
  days: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Algeria is UTC+1 year round; subtracting the offset yields the local calendar day. */
const ALGERIA_OFFSET_MS = 60 * 60 * 1000;

/** Round a DZD amount to two decimals to absorb binary floating-point noise. */
function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Algeria calendar day (`YYYY-MM-DD`) for an offset ISO timestamp.
 * Returns null for an unparseable input so callers can skip the window.
 */
function toAlgeriaDayKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getTime() + ALGERIA_OFFSET_MS).toISOString().slice(0, 10);
}

function dayKeyToUtcMs(dayKey: string): number {
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day);
}

/**
 * The proposed amount for a payment, before any hand edit.
 *
 * MONTHLY prorates at `salary / 30` per day; DAILY multiplies the daily wage
 * by the days; WEEKLY is left unprorated (not offered in the UI).
 */
export function computeProposedSalaryAmount({
  periodType,
  salaryAmountDzd,
  days,
}: {
  periodType: SalaryPeriodType;
  salaryAmountDzd: number;
  days: number;
}): number {
  if (periodType === "MONTHLY") {
    return roundAmount((salaryAmountDzd / 30) * days);
  }

  if (periodType === "DAILY") {
    return roundAmount(salaryAmountDzd * days);
  }

  return roundAmount(salaryAmountDzd);
}

/**
 * Suggested days per project for a pay period, derived from the worker's
 * `projectAssignment` windows.
 *
 * Each window is clamped to `[periodStart, periodEnd]` and every distinct
 * calendar day it covers is counted once for its project. Overlapping
 * windows on the same project therefore do not double-count. An open-ended
 * assignment (`endDate === null`) runs up to the period end.
 *
 * The result is only a starting point: the split is typed by hand in the UI
 * because assignments are often corrected a day or two late. Projects with
 * no day inside the period are omitted, and the order is deterministic
 * (project id ascending).
 */
export function deriveSalaryProjectDays({
  assignments,
  periodStart,
  periodEnd,
}: {
  assignments: readonly SalaryProjectAssignmentWindow[];
  periodStart: string;
  periodEnd: string;
}): SalaryProjectDaySplit[] {
  const periodStartKey = toAlgeriaDayKey(periodStart);
  const periodEndKey = toAlgeriaDayKey(periodEnd);

  if (!periodStartKey || !periodEndKey) {
    return [];
  }

  const periodStartMs = dayKeyToUtcMs(periodStartKey);
  const periodEndMs = dayKeyToUtcMs(periodEndKey);

  if (periodStartMs > periodEndMs) {
    return [];
  }

  const daysByProject = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const windowStartKey = toAlgeriaDayKey(assignment.startDate);
    if (!windowStartKey) {
      continue;
    }

    const windowEndKey = assignment.endDate ? toAlgeriaDayKey(assignment.endDate) : periodEndKey;
    if (!windowEndKey) {
      continue;
    }

    const windowStartMs = Math.max(dayKeyToUtcMs(windowStartKey), periodStartMs);
    const windowEndMs = Math.min(dayKeyToUtcMs(windowEndKey), periodEndMs);
    if (windowStartMs > windowEndMs) {
      continue;
    }

    let projectDays = daysByProject.get(assignment.projectId);
    if (!projectDays) {
      projectDays = new Set<string>();
      daysByProject.set(assignment.projectId, projectDays);
    }

    for (let ms = windowStartMs; ms <= windowEndMs; ms += MS_PER_DAY) {
      projectDays.add(new Date(ms).toISOString().slice(0, 10));
    }
  }

  return Array.from(daysByProject.entries())
    .map(([projectId, projectDays]) => ({ projectId, days: projectDays.size }))
    .filter((split) => split.days > 0)
    .sort((left, right) => left.projectId.localeCompare(right.projectId));
}
