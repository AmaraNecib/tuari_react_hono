/**
 * Salary proration and per-project split helpers (issue #412).
 *
 * `computeProposedSalaryAmount` is shared by the API service and the web payment
 * form so the proposed amount cannot drift between them. `deriveSalaryProjectDays`
 * is the web form's starting default only: the API accepts an explicit
 * `projectSplits` payload and never derives or rewrites the split.
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

  return instantToAlgeriaDayKey(parsed.getTime());
}

/** Algeria calendar day for a known-valid epoch-millisecond instant. */
function instantToAlgeriaDayKey(ms: number): string {
  return new Date(ms + ALGERIA_OFFSET_MS).toISOString().slice(0, 10);
}

function dayKeyToUtcMs(dayKey: string): number {
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day);
}

/** The calendar day `count` days after `dayKey` (negative counts go back). */
function addDays(dayKey: string, count: number): string {
  return new Date(dayKeyToUtcMs(dayKey) + count * MS_PER_DAY).toISOString().slice(0, 10);
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
 * calendar day it covers is counted once. A day belongs to exactly one
 * project: an assignment window is half-open (`[startDate, endDate)`), so the
 * instant that ends one project's assignment and starts the next leaves the
 * handoff day to the new project rather than counting it twice, and any day
 * two still-overlapping windows dispute is claimed by the first project in
 * project-id order. Overlapping windows on the same project therefore do not
 * double-count, and a worker whose assignments cover the whole period can
 * never be credited more days than were paid. An open-ended assignment
 * (`endDate === null`) runs up to the period end.
 *
 * The covered days are then normalized against the period so the default
 * reconciles with the payment's own day count: a project covering the whole
 * period gets all of `days` (default 30), a project covering 15 of a 30-day
 * period gets 15, and the lines always sum to the scaled coverage. Every line
 * is floored and the remaining days are handed out by largest fractional part
 * (largest-remainder/Hamilton), so a fully covered period sums EXACTLY to
 * `days`, a partially covered period leaves the rest unallocated, and the
 * rounding correction can never drive a line negative (which used to drop it
 * and leave the paid days over-allocated). A fully covered period therefore
 * sums to `days` even through a project handoff, never to `days + 1`.
 */
export function deriveSalaryProjectDays({
  assignments,
  periodStart,
  periodEnd,
  days,
}: {
  assignments: readonly SalaryProjectAssignmentWindow[];
  periodStart: string;
  periodEnd: string;
  days: number;
}): SalaryProjectDaySplit[] {
  if (!Number.isInteger(days) || days <= 0) {
    return [];
  }

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
  // A calendar day may be claimed by only one project. Project-id order is the
  // deterministic priority for the rare day two windows still dispute after
  // the half-open boundary is applied.
  const claimedDays = new Set<string>();
  const orderedAssignments = [...assignments].sort((left, right) =>
    left.projectId.localeCompare(right.projectId),
  );

  for (const assignment of orderedAssignments) {
    const windowStartKey = toAlgeriaDayKey(assignment.startDate);
    if (!windowStartKey) {
      continue;
    }

    // Half-open `[start, end)`: the exclusive end day is the day AFTER the one
    // the end instant falls on, so an assignment ending at the start of day D
    // leaves D to the next assignment, while one ending at the end of (or
    // during) day D still covers D. An open-ended window runs to period end.
    let windowEndExclusiveKey: string;
    if (assignment.endDate) {
      const endMs = new Date(assignment.endDate).getTime();
      if (Number.isNaN(endMs)) {
        continue;
      }
      const lastCoveredDayKey = instantToAlgeriaDayKey(endMs - 1);
      windowEndExclusiveKey = addDays(lastCoveredDayKey, 1);
    } else {
      windowEndExclusiveKey = addDays(periodEndKey, 1);
    }

    const windowStartMs = Math.max(dayKeyToUtcMs(windowStartKey), periodStartMs);
    const windowEndExclusiveMs = Math.min(
      dayKeyToUtcMs(windowEndExclusiveKey),
      periodEndMs + MS_PER_DAY,
    );
    if (windowStartMs >= windowEndExclusiveMs) {
      continue;
    }

    let projectDays = daysByProject.get(assignment.projectId);
    if (!projectDays) {
      projectDays = new Set<string>();
      daysByProject.set(assignment.projectId, projectDays);
    }

    for (let ms = windowStartMs; ms < windowEndExclusiveMs; ms += MS_PER_DAY) {
      const dayKey = new Date(ms).toISOString().slice(0, 10);
      if (claimedDays.has(dayKey)) {
        continue;
      }
      claimedDays.add(dayKey);
      projectDays.add(dayKey);
    }
  }

  const coveredProjects = Array.from(daysByProject.entries())
    .map(([projectId, projectDays]) => ({ projectId, coveredDays: projectDays.size }))
    .filter((entry) => entry.coveredDays > 0)
    .sort((left, right) => left.projectId.localeCompare(right.projectId));

  if (coveredProjects.length === 0) {
    return [];
  }

  const periodLengthDays = Math.floor((periodEndMs - periodStartMs) / MS_PER_DAY) + 1;

  // Exact scaled share per project. Floor it first (largest-remainder/Hamilton),
  // then hand back the leftover integer days to the lines with the largest
  // fractional part. This keeps every line within one day of its exact share,
  // never lets a correction push a line below zero, and makes the lines sum to
  // `round(totalScaledDays)` — exactly `days` when the period is fully covered.
  const lines = coveredProjects.map((entry) => {
    const exactDays = (entry.coveredDays / periodLengthDays) * days;
    return {
      projectId: entry.projectId,
      coveredDays: entry.coveredDays,
      exactDays,
      days: Math.floor(exactDays),
    };
  });

  const targetTotalDays = Math.round(lines.reduce((total, line) => total + line.exactDays, 0));
  let remainingDays = targetTotalDays - lines.reduce((total, line) => total + line.days, 0);

  const byRemainder = [...lines].sort((left, right) => {
    const fractionDifference = right.exactDays - Math.floor(right.exactDays) - (left.exactDays - Math.floor(left.exactDays));
    if (fractionDifference !== 0) {
      return fractionDifference;
    }
    if (right.coveredDays !== left.coveredDays) {
      return right.coveredDays - left.coveredDays;
    }
    return left.projectId.localeCompare(right.projectId);
  });

  for (const line of byRemainder) {
    if (remainingDays <= 0) {
      break;
    }
    line.days += 1;
    remainingDays -= 1;
  }

  return lines
    .map(({ projectId, days: projectDays }) => ({ projectId, days: projectDays }))
    .filter((split) => split.days > 0);
}
