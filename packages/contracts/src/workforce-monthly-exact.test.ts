import { describe, expect, it } from "vitest";
import { exactSalaryMonthlyAmountsSchema, suggestExactSalaryMonthAmounts } from "./workforce-monthly-exact";

const months = [
  { id: "october", month: "2026-10", amount: "12000" },
  { id: "november", month: "2026-11", amount: "18000" },
];

describe("exact month-first salary amounts", () => {
  it("keeps each month bounded while deriving wider read-only totals without a Number bridge", () => {
    const result = exactSalaryMonthlyAmountsSchema.parse({ currency: "DZD", months: months.map(row => ({ ...row, amount: "92233720368547758.07" })) });
    expect(result.totalAmount).toBe("184467440737095516.14");
    for (const input of [
      { currency: "EUR", months },
      { currency: "DZD", months: [] },
      { currency: "DZD", months, totalAmount: "1" },
      { currency: "DZD", months: [{ ...months[0], month: "2026-13" }] },
      { currency: "DZD", months: [{ ...months[0], amount: "-1" }] },
      { currency: "DZD", months: [{ ...months[0], amount: 100 }] },
      { currency: "DZD", months: [{ ...months[0], amount: "92233720368547758.08" }] },
    ]) expect(exactSalaryMonthlyAmountsSchema.safeParse(input).success).toBe(false);
  });

  it("requires explicit positive safe working-day weights and bounded suggestion targets", () => {
    const input = { currency: "DZD" as const, totalAmount: "1", months: [{ id: "oct", month: "2026-10" }], calculation: { basis: "WORK_DAYS" as const } };
    for (const days of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => suggestExactSalaryMonthAmounts({ ...input, months: [{ ...input.months[0]!, days }] })).toThrow();
    }
    expect(suggestExactSalaryMonthAmounts({ ...input, months: [{ ...input.months[0]!, days: 366 }] }).months[0]?.amount).toBe("1.00");
    expect(() => suggestExactSalaryMonthAmounts({ ...input, totalAmount: "92233720368547758.08" })).toThrow();
    expect(() => suggestExactSalaryMonthAmounts({ ...input, months: [{ ...input.months[0]!, days: 1 }, { ...input.months[0]!, days: 2 }] })).toThrow();
  });

  it("counts explicitly chosen calendar dates inclusively, handles leap years and refuses missing months", () => {
    const input = { currency: "DZD" as const, totalAmount: "1", months: [{ id: "feb", month: "2024-02" }, { id: "mar", month: "2024-03" }], calculation: { basis: "CALENDAR_DAYS" as const, periodStart: "2024-02-29", periodEnd: "2024-03-01" } };
    expect(suggestExactSalaryMonthAmounts(input).months.map(row => row.amount)).toEqual(["0.50", "0.50"]);
    expect(() => suggestExactSalaryMonthAmounts({ ...input, months: [input.months[0]!] })).toThrow();
    expect(() => suggestExactSalaryMonthAmounts({ ...input, calculation: { ...input.calculation, periodStart: "2024-02-30" } })).toThrow();
    expect(() => suggestExactSalaryMonthAmounts({ ...input, calculation: { ...input.calculation, periodEnd: "2024-02-28" } })).toThrow();
  });

  it("uses explicitly entered work days without deriving or capping the approved monthly amounts", () => {
    const proposal = suggestExactSalaryMonthAmounts({ currency: "DZD", totalAmount: "30000", months: [{ id: "october", month: "2026-10", days: 12 }, { id: "november", month: "2026-11", days: 10 }], calculation: { basis: "WORK_DAYS" } });
    expect(proposal.months.map(row => row.amount)).toEqual(["16363.64", "13636.36"]);
    expect(proposal.weights).toEqual([{ id: "october", weight: "12" }, { id: "november", weight: "10" }]);
  });

  it("previews equal shares without applying them and conserves a one-cent remainder in recorded order", () => {
    const input = { currency: "DZD" as const, totalAmount: "0.01", months: [...months, { id: "december", month: "2026-12", amount: "1" }].map(({ id, month }) => ({ id, month })), calculation: { basis: "EQUAL" as const } };
    const proposal = suggestExactSalaryMonthAmounts(input);
    expect(proposal.months.map(row => [row.id, row.amount])).toEqual([["october", "0.01"], ["november", "0.00"], ["december", "0.00"]]);
    expect(proposal.totalAmount).toBe("0.01");
    expect(months.map(row => row.amount)).toEqual(["12000", "18000"]);
  });

  it("rejects duplicate month and row identities rather than silently merging earnings", () => {
    for (const rows of [
      [months[0], { ...months[1], month: "2026-10" }],
      [months[0], { ...months[1], id: "october" }],
    ]) {
      expect(exactSalaryMonthlyAmountsSchema.safeParse({ currency: "DZD", months: rows }).success).toBe(false);
    }
  });

  it("derives its total from explicitly entered months without changing neighboring amounts", () => {
    const input = { currency: "DZD", months };
    expect(exactSalaryMonthlyAmountsSchema.parse(input)).toEqual({
      currency: "DZD", totalAmount: "30000.00",
      months: [{ ...months[0], amount: "12000.00" }, { ...months[1], amount: "18000.00" }],
    });
    const edited = { ...input, months: [{ ...months[0], amount: "10000" }, months[1]] };
    expect(exactSalaryMonthlyAmountsSchema.parse(edited)).toMatchObject({
      totalAmount: "28000.00", months: [{ amount: "10000.00" }, { amount: "18000.00" }],
    });
    expect(months.map(row => row.amount)).toEqual(["12000", "18000"]);
  });
});
