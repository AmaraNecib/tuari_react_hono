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
});

describe("deriveSalaryProjectDays", () => {
  it("counts a full-period assignment as the period's days", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") }],
        ...MARCH_2026,
      }),
    ).toEqual([{ projectId: "p1", days: 31 }]);
  });

  it("clamps a window that starts before the period", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-01-15", "start"), endDate: algeriaDay("2026-03-10", "end") }],
        ...MARCH_2026,
      }),
    ).toEqual([{ projectId: "p1", days: 10 }]);
  });

  it("clamps a window that ends after the period", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-20", "start"), endDate: algeriaDay("2026-06-30", "end") }],
        ...MARCH_2026,
      }),
    ).toEqual([{ projectId: "p1", days: 12 }]);
  });

  it("treats a null end date as open-ended up to the period end", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-05", "start"), endDate: null }],
        ...MARCH_2026,
      }),
    ).toEqual([{ projectId: "p1", days: 27 }]);
  });

  it("returns nothing when the worker has no assignments", () => {
    expect(deriveSalaryProjectDays({ assignments: [], ...MARCH_2026 })).toEqual([]);
  });

  it("counts overlapping windows on the same project once", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-15", "end") },
          { projectId: "p1", startDate: algeriaDay("2026-03-10", "start"), endDate: algeriaDay("2026-03-20", "end") },
        ],
        ...MARCH_2026,
      }),
    ).toEqual([{ projectId: "p1", days: 20 }]);
  });

  it("returns one line per project in deterministic order", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [
          { projectId: "b", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-31", "end") },
          { projectId: "a", startDate: algeriaDay("2026-03-01", "start"), endDate: algeriaDay("2026-03-10", "end") },
        ],
        ...MARCH_2026,
      }),
    ).toEqual([
      { projectId: "a", days: 10 },
      { projectId: "b", days: 31 },
    ]);
  });

  it("omits a window that lies entirely outside the period", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-01-01", "start"), endDate: algeriaDay("2026-01-31", "end") }],
        ...MARCH_2026,
      }),
    ).toEqual([]);
  });

  it("covers a single-day period", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-05", "start"), endDate: null }],
        periodStart: algeriaDay("2026-03-05", "start"),
        periodEnd: algeriaDay("2026-03-05", "end"),
      }),
    ).toEqual([{ projectId: "p1", days: 1 }]);
  });

  it("skips an unparseable timestamp instead of throwing", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: "not-a-date", endDate: null }],
        ...MARCH_2026,
      }),
    ).toEqual([]);
  });

  it("returns nothing for an inverted period", () => {
    expect(
      deriveSalaryProjectDays({
        assignments: [{ projectId: "p1", startDate: algeriaDay("2026-03-01", "start"), endDate: null }],
        periodStart: algeriaDay("2026-03-31", "start"),
        periodEnd: algeriaDay("2026-03-01", "end"),
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
