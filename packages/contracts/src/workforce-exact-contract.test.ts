import { describe, expect, it } from "vitest";
import { exactProjectSalaryCostSchema, exactSalaryEarningRecordSchema, exactSalaryMonthlyApprovalResultSchema } from "./workforce-exact-contract";

const earning = {
  id: "earning", employeeId: "worker", currency: "DZD", periodStart: "2026-10-01", periodEnd: "2026-10-31",
  approvedAmount: "35000", unallocatedAmount: "0", segments: [{ id: "A", projectId: "project", amount: "35000" }],
  debtAccountId: "payable", debtEntryId: "original", actorUserId: "operator", actorLabel: "Operator", transactionId: "audit", createdAt: "2026-11-11T00:00:00.000Z",
};

describe("opt-in exact payroll read contracts", () => {
  it("validates conserved earnings and zero/nonzero obligation links", () => {
    expect(exactSalaryEarningRecordSchema.parse(earning).approvedAmount).toBe("35000.00");
    expect(exactSalaryEarningRecordSchema.safeParse({ ...earning, unallocatedAmount: "1" }).success).toBe(false);
    expect(exactSalaryEarningRecordSchema.safeParse({ ...earning, debtEntryId: null }).success).toBe(false);
    const zero = { ...earning, approvedAmount: "0", segments: [], debtAccountId: null, debtEntryId: null };
    expect(exactSalaryEarningRecordSchema.parse(zero).approvedAmount).toBe("0.00");
    expect(exactSalaryEarningRecordSchema.safeParse({ ...zero, debtAccountId: "payable" }).success).toBe(false);
  });

  it("rejects mismatched returned totals and wrong-project segments", () => {
    const result = { currency: "DZD", totalAmount: "35000.00", months: [{ id: "oct", month: "2026-10", earning }] };
    expect(exactSalaryMonthlyApprovalResultSchema.parse(result).totalAmount).toBe("35000.00");
    expect(exactSalaryMonthlyApprovalResultSchema.safeParse({ ...result, totalAmount: "35001.00" }).success).toBe(false);
    const cost = { projectId: "project", currency: "DZD", totalAmount: "35000.00", segments: [{ earningId: "earning", employeeId: "worker", periodStart: earning.periodStart, periodEnd: earning.periodEnd, segment: earning.segments[0] }] };
    expect(exactProjectSalaryCostSchema.parse(cost).segments).toHaveLength(1);
    expect(exactProjectSalaryCostSchema.safeParse({ ...cost, projectId: "other" }).success).toBe(false);
    expect(exactProjectSalaryCostSchema.safeParse({ ...cost, totalAmount: "1.00" }).success).toBe(false);
    expect(exactProjectSalaryCostSchema.safeParse({ ...cost, totalAmount: 35000 }).success).toBe(false);
  });

  it("keeps derived labor cost wider than scalar Money while each segment remains bounded", () => {
    const row = { earningId: "earning", employeeId: "worker", periodStart: earning.periodStart, periodEnd: earning.periodEnd, segment: { id: "A", projectId: "project", amount: "92233720368547758.07" } };
    const cost = { projectId: "project", currency: "DZD", totalAmount: "184467440737095516.14", segments: [row, { ...row, earningId: "other" }] };
    expect(exactProjectSalaryCostSchema.parse(cost).totalAmount).toBe("184467440737095516.14");
  });
});
