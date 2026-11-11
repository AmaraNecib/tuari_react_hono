import { describe, expect, it } from "vitest";
import { exactSalaryMonthlyApprovalInputSchema } from "./workforce-monthly-exact";

const input = {
  requestId: "monthly-approval", employeeId: "worker", currency: "DZD",
  months: [
    { id: "oct", month: "2026-10", amount: "12000", unallocatedAmount: "2000", segments: [{ id: "A", projectId: "project", amount: "10000", days: 12 }] },
    { id: "nov", month: "2026-11", amount: "18000", unallocatedAmount: "18000", segments: [] },
  ],
};

describe("explicit monthly approval command", () => {
  it("retains independent amounts and allocations, derives total and records each selected month as a covered period", () => {
    const result = exactSalaryMonthlyApprovalInputSchema.parse(input);
    expect(result.totalAmount).toBe("30000.00");
    expect(result.months).toEqual([
      { ...input.months[0], amount: "12000.00", unallocatedAmount: "2000.00", segments: [{ id: "A", projectId: "project", amount: "10000.00", days: 12 }], periodStart: "2026-10-01", periodEnd: "2026-10-31" },
      { ...input.months[1], amount: "18000.00", unallocatedAmount: "18000.00", periodStart: "2026-11-01", periodEnd: "2026-11-30" },
    ]);
    expect(exactSalaryMonthlyApprovalInputSchema.parse({ ...input, months: [{ ...input.months[0], amount: "10000", unallocatedAmount: "0" }, input.months[1]] }).totalAmount).toBe("28000.00");
  });

  it.each([["2024-02", "2024-02-29"], ["2023-02", "2023-02-28"], ["9999-12", "9999-12-31"], ["0000-02", "0000-02-29"]])("uses the complete selected month %s without inferring it from a cash date", (month, periodEnd) => {
    const result = exactSalaryMonthlyApprovalInputSchema.parse({ ...input, months: [{ ...input.months[1], month }] });
    expect(result.months[0]).toMatchObject({ month, periodStart: `${month}-01`, periodEnd });
  });

  it("requires explicit conserved allocation per month and refuses hidden target or covered-period overrides", () => {
    for (const candidate of [
      { ...input, totalAmount: "30000" },
      { ...input, months: [{ ...input.months[0], unallocatedAmount: "1999.99" }] },
      { ...input, months: [{ ...input.months[0], unallocatedAmount: undefined }] },
      { ...input, months: [{ ...input.months[0], periodStart: "2026-09-01" }] },
      { ...input, months: [{ ...input.months[0], segments: [input.months[0]!.segments[0], input.months[0]!.segments[0]], amount: "22000" }] },
      { ...input, months: [{ ...input.months[0], month: "2026-13" }] },
      { ...input, months: [input.months[0], { ...input.months[1], id: "oct" }] },
      { ...input, months: [input.months[0], { ...input.months[1], month: "2026-10" }] },
      { ...input, months: [] },
    ]) expect(exactSalaryMonthlyApprovalInputSchema.safeParse(candidate).success).toBe(false);
  });

  it("bounds individual wages but derives a wider exact total without narrowing it", () => {
    const result = exactSalaryMonthlyApprovalInputSchema.parse({ ...input, months: input.months.map(row => ({ ...row, amount: "92233720368547758.07", unallocatedAmount: "92233720368547758.07", segments: [] })) });
    expect(result.totalAmount).toBe("184467440737095516.14");
    expect(exactSalaryMonthlyApprovalInputSchema.safeParse({ ...input, months: [{ ...input.months[1], amount: "92233720368547758.08", unallocatedAmount: "92233720368547758.08" }] }).success).toBe(false);
  });
});
