import { describe, expect, it } from "vitest";

import { computeProposedSalaryAmount, deriveSalaryProjectDays } from "./salary-days";
import { employeeSalaryPaymentCreateInputSchema } from "./workforce";

/** Algerians day-boundary ISO helper mirroring apps/web's toAlgeriaDayBoundaryIso. */
function algeriaDay(date: string, boundary: "start" | "end"): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map((part) => Number.parseInt(part, 10));
  return boundary === "start"
    ? new Date(Date.UTC(year, month - 1, day, -1, 0, 0, 0)).toISOString()
    : new Date(Date.UTC(year, month - 1, day, 22, 59, 59, 999)).toISOString();
}

const MARCH_2026 = { periodStart: algeriaDay("2026-03-01", "start"), periodEnd: algeriaDay("2026-03-31", "end") };

describe("computeProposedSalaryAmount", () => {
  it("prorates a monthly salary at salary/30 per day", () => {
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 30000, days: 30 })).toBe(30000);
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 30000, days: 27 })).toBe(27000);
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 30000, days: 15 })).toBe(15000);
  });

  it("multiplies the daily wage by the days for a daily worker", () => {
    expect(computeProposedSalaryAmount({ periodType: "DAILY", salaryAmountDzd: 1500, days: 12 })).toBe(18000);
  });

  it("leaves a weekly salary unprorated (weekly is not offered in the UI)", () => {
    expect(computeProposedSalaryAmount({ periodType: "WEEKLY", salaryAmountDzd: 9000, days: 5 })).toBe(9000);
  });

  it("absorbs binary floating-point noise to two decimals", () => {
    // 1000 / 30 * 27 === 900.0000000000001 without rounding.
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 1000, days: 27 })).toBe(900);
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 100, days: 1 })).toBe(3.33);
  });

  it("prorates beyond a calendar month (a day is a 30th in every month)", () => {
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 30000, days: 31 })).toBe(31000);
    expect(computeProposedSalaryAmount({ periodType: "MONTHLY", salaryAmountDzd: 30000, days: 1 })).toBe(1000);
  });
});

describe("deriveSalaryProjectDays", () => {
  it("normalizes a full-period assignment to the payment's day count", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 30 }]);
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") }],
        ...MARCH_2026,
        days: 27,
      }),
    ).toEqual([{ projectId: "p1", days: 27 }]);
  });

  it("breaks a fractional tie toward the wider coverage", () => {
    // A 6-day period with a 3-day payment: the 1-day project's exact share is
    // 0.5 and the 3-day project's is 1.5, so both fractions tie. The leftover
    // day goes to the wider coverage. The windows do not overlap, so the day
    // itself is not in dispute.
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-01", "end") },
          { projectId: "b", startDate: algeriaDay("2026-03-02", "start"), endDate: algeriaDay("2026-03-04", "end") },
        ],
        periodStart: algeriaDay("2026-03-01", "start"),
        periodEnd: algeriaDay("2026-03-06", "end"),
        days: 3,
      }),
    ).toEqual([{ projectId: "b", days: 2 }]);
  });

  it("clamps a window that starts before the period and scales its coverage", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-01-15", "start"), endDate: algeriaDay("2026-03-10", "end") }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 10 }]);
  });

  it("clamps a window that ends after the period and scales its coverage", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-20", "start"), endDate: algeriaDay("2026-06-30", "end") }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 12 }]);
  });

  it("treats a null end date as open-ended up to the period end", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-05", "start"), endDate: null }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 26 }]);
  });

  it("returns nothing when the worker has no assignments", () => {
    expect(deriveSalaryProjectDays({ assignments: [], ...MARCH_2026, days: 30 })).toEqual([]);
  });

  it("counts overlapping windows on the same project once", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-15", "end") },
          { projectId: "p1", startDate: algeriaDay("2026-03-10", "start"), endDate: algeriaDay("2026-03-20", "end") },
        ],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 19 }]);
  });

  it("returns one normalized line per project in deterministic order", () => {
    // The windows overlap on March 1-10, so project `a` (first in project-id
    // order) claims those days and project `b` keeps the remaining 21. The
    // lines are normalized to the 30 paid days and returned in project-id
    // order.
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "b", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") },
          { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-10", "end") },
        ],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([
      { projectId: "a", days: 10 },
      { projectId: "b", days: 20 },
    ]);
  });

  it("keeps a partially covered period unallocated beyond the scaled coverage", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-15", "end") }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 15 }]);
  });

  it("makes the lines sum exactly to the scaled coverage despite rounding", () => {
    // 16 + 15 covered days of a 31-day period, scaled to 30: 15.48 and 14.52
    // both round to 15, and the target sum (30) matches, so no adjustment.
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-16", "end") },
          { projectId: "b", startDate: algeriaDay("2026-03-17", "start"), endDate: algeriaDay("2026-03-31", "end") },
        ],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([
      { projectId: "a", days: 15 },
      { projectId: "b", days: 15 },
    ]);
  });

  it("keeps the split within the paid days when the payment is smaller than the project count", () => {
    // March coverage split across five non-overlapping projects (7 + 6 + 6 +
    // 6 + 6 = 31 days) with a 3-day payment. Rounding each line to 1 gave 5
    // allocated days; the old correction subtracted 2 from the largest line,
    // drove it negative, dropped it, and left 4 days allocated — which the
    // dialog then rejected as over-allocated for a perfectly valid payment.
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-07", "end") },
          { projectId: "b", startDate: algeriaDay("2026-03-08", "start"), endDate: algeriaDay("2026-03-13", "end") },
          { projectId: "c", startDate: algeriaDay("2026-03-14", "start"), endDate: algeriaDay("2026-03-19", "end") },
          { projectId: "d", startDate: algeriaDay("2026-03-20", "start"), endDate: algeriaDay("2026-03-25", "end") },
          { projectId: "e", startDate: algeriaDay("2026-03-26", "start"), endDate: algeriaDay("2026-03-31", "end") },
        ],
        ...MARCH_2026,
        days: 3,
      }),
    ).toEqual([
      { projectId: "a", days: 1 },
      { projectId: "b", days: 1 },
      { projectId: "c", days: 1 },
    ]);
  });

  it("assigns the leftover days by largest remainder even when every line would round up", () => {
    // A 3-day period, one project per day, a 2-day payment: every exact share
    // is 2/3 and would round up to 1 (sum 3). Largest-remainder assigns 2.
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-01", "end") },
          { projectId: "b", startDate: algeriaDay("2026-03-02", "start"), endDate: algeriaDay("2026-03-02", "end") },
          { projectId: "c", startDate: algeriaDay("2026-03-03", "start"), endDate: algeriaDay("2026-03-03", "end") },
        ],
        periodStart: algeriaDay("2026-03-01", "start"),
        periodEnd: algeriaDay("2026-03-03", "end"),
        days: 2,
      }),
    ).toEqual([
      { projectId: "a", days: 1 },
      { projectId: "b", days: 1 },
    ]);
  });

  it("keeps the default within half a day of each project's exact share", () => {
    // A 2-day period, one project per day, a single paid day: each exact share
    // is 0.5. The older correction rounded both up to 1 (sum 2) and subtracted
    // the overshoot from the largest line, leaving a zero-day line behind. The
    // largest-remainder default keeps the single day on one line.
    const splits = deriveSalaryProjectDays({
      assignments: [
        { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-01", "end") },
        { projectId: "b", startDate: algeriaDay("2026-03-02", "start"), endDate: algeriaDay("2026-03-02", "end") },
      ],
      periodStart: algeriaDay("2026-03-01", "start"),
      periodEnd: algeriaDay("2026-03-02", "end"),
      days: 1,
    });

    expect(splits).toEqual([{ projectId: "a", days: 1 }]);
    expect(splits.reduce((total, split) => total + split.days, 0)).toBe(1);
    expect(splits.every((split) => split.days > 0 && split.days <= 1)).toBe(true);
  });

  it("omits a window that lies entirely outside the period", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-01-01", "start"), endDate: algeriaDay("2026-01-31", "end") }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([]);
  });

  it("normalizes a single-day period to the payment's day count", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-05", "start"), endDate: null }],
        periodStart: algeriaDay("2026-03-05", "start"),
        periodEnd: algeriaDay("2026-03-05", "end"),
        days: 1,
      }),
    ).toEqual([{ projectId: "p1", days: 1 }]);
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-05", "start"), endDate: null }],
        periodStart: algeriaDay("2026-03-05", "start"),
        periodEnd: algeriaDay("2026-03-05", "end"),
        days: 30,
      }),
    ).toEqual([{ projectId: "p1", days: 30 }]);
  });

  it("skips an unparseable timestamp instead of throwing", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: "not-a-date", endDate: null }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([]);
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: "not-a-date" }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([]);
  });

  it("skips an inverted assignment window", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-20", "start"), endDate: algeriaDay("2026-03-10", "end") }],
        ...MARCH_2026,
        days: 30,
      }),
    ).toEqual([]);
  });

  it("attributes the handoff day to exactly one project", () => {
    // A worker moves from project A to project B at the same instant. The
    // half-open windows must not count that calendar day for both projects:
    // the suggested split has to sum to the 30 days being paid, not 31.
    const handoff = algeriaDay("2026-03-16", "start");
    const splits = deriveSalaryProjectDays({
      assignments: [
        { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: handoff },
        { projectId: "b", startDate: handoff, endDate: algeriaDay("2026-03-31", "end") },
      ],
      ...MARCH_2026,
      days: 30,
    });

    expect(splits.reduce((total, split) => total + split.days, 0)).toBe(30);
    expect(splits.map((split) => split.projectId)).toEqual(["a", "b"]);
  });

  it("de-duplicates a day two overlapping projects both claim", () => {
    // Overlapping assignment windows cannot credit the same worked day to two
    // projects, so the fully covered period still sums to the paid days.
    const splits = deriveSalaryProjectDays({
      assignments: [
        { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") },
        { projectId: "b", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") },
      ],
      ...MARCH_2026,
      days: 30,
    });

    // Every March day was claimed by project `a` (the first in project-id
    // order), so project `b` has no unclaimed day left to be credited.
    expect(splits).toEqual([{ projectId: "a", days: 30 }]);
    expect(splits.reduce((total, split) => total + split.days, 0)).toBe(30);
  });

  it("leaves a line with under half a day out of the default", () => {
    // One covered day of 31 scaled to a single paid day rounds to zero: the
    // default is unallocated, and the person can add the line by hand.
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-01", "end") }],
        ...MARCH_2026,
        days: 1,
      }),
    ).toEqual([]);
  });

  it("returns nothing for an inverted period or an invalid day count", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: null }],
        periodStart: "not-a-date",
        periodEnd: algeriaDay("2026-03-31", "end"),
        days: 30,
      }),
    ).toEqual([]);
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: null }],
        periodStart: algeriaDay("2026-03-31", "start"),
        periodEnd: algeriaDay("2026-03-01", "end"),
        days: 30,
      }),
    ).toEqual([]);
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: null }],
        ...MARCH_2026,
        days: 0,
      }),
    ).toEqual([]);
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: null }],
        ...MARCH_2026,
        days: 2.5,
      }),
    ).toEqual([]);
  });
});

describe("salary payment create contract (#412)", () => {
  it("defaults days to a 30-day month and the split to empty", () => {
    const parsed = employeeSalaryPaymentCreateInputSchema.parse({ employeeId: "e1" });
    expect(parsed.days).toBe(30);
    expect(parsed.projectSplits).toEqual([]);
  });

  it("accepts an omitted amount so the server can propose it", () => {
    expect(employeeSalaryPaymentCreateInputSchema.parse({ employeeId: "e1" }).actualAmountDzd).toBeUndefined();
  });

  it("rejects fractional or non-positive days and split days at the wire", () => {
    expect(employeeSalaryPaymentCreateInputSchema.safeParse({ employeeId: "e1", days: 2.5 }).success).toBe(false);
    expect(employeeSalaryPaymentCreateInputSchema.safeParse({ employeeId: "e1", days: 0 }).success).toBe(false);
    expect(
      employeeSalaryPaymentCreateInputSchema.safeParse({
        employeeId: "e1",
        projectSplits: [{ projectId: "p1", days: 1.5 }],
      }).success,
    ).toBe(false);
  });
});
