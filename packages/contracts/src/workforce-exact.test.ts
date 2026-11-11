import { describe, expect, it } from "vitest";
import {
  exactSalaryReferenceSchema,
  exactSalaryApprovalInputSchema,
  suggestExactSalaryAmount,
  suggestExactSalaryAllocations,
  exactEmployeeCreateInputSchema,
  exactEmployeeUpdateInputSchema,
  exactEmployeeSalaryPaymentSchema,
  exactSalaryOpeningReviewInputSchema,
  exactSalaryCashInputSchema,
} from "./workforce-exact";

const segment = (id: string, projectId: string, amount: string, days?: number) => ({ id, projectId, amount, ...(days === undefined ? {} : { days }) });
const approval = {
  requestId: "approval-command", employeeId: "worker", currency: "DZD" as const,
  periodStart: "2026-11-01", periodEnd: "2026-11-30", approvedAmount: "62500", unallocatedAmount: "0",
  segments: [segment("a-first", "A", "10000", 5), segment("b", "B", "37500", 15), segment("a-last", "A", "15000", 5)],
};

describe("opt-in exact workforce input and suggestions", () => {
  it("distinguishes unreviewed opening from confirmed zero and requires explicit classification of excess cash", () => {
    const command = { requestId: "review", employeeId: "worker", currency: "DZD" };
    expect(exactSalaryOpeningReviewInputSchema.parse({ ...command, review: { status: "UNREVIEWED" } }).review).toEqual({ status: "UNREVIEWED" });
    expect(exactSalaryOpeningReviewInputSchema.parse({ ...command, review: { status: "REVIEWED", wagesOwed: "0", advancesOwed: "0" } }).review).toEqual({ status: "REVIEWED", wagesOwed: "0.00", advancesOwed: "0.00" });
    expect(exactSalaryOpeningReviewInputSchema.safeParse({ ...command, review: { status: "UNREVIEWED", wagesOwed: "0" } }).success).toBe(false);
    const cash = { requestId: "cash", employeeId: "worker", currency: "DZD", amount: "40000", paymentDate: "2026-11-10T00:00:00.000Z", wageAllocations: [{ id: "wage-part", source: { kind: "EARNING", id: "approved-wages" }, amount: "35000" }], advance: null };
    expect(exactSalaryCashInputSchema.safeParse(cash).success).toBe(false);
    expect(exactSalaryCashInputSchema.parse({ ...cash, advance: { id: "explicit-advance", amount: "5000" } }).advance?.amount).toBe("5000.00");
    expect(exactSalaryCashInputSchema.parse({ ...cash, wageAllocations: [...cash.wageAllocations, { id: "bonus-part", source: { kind: "EARNING", id: "approved-bonus" }, amount: "5000" }] }).advance).toBeNull();
    expect(exactSalaryCashInputSchema.safeParse({ ...cash, amount: "35000", advance: undefined }).success).toBe(false);
  });

  it("rejects zero cash totals while accepting the smallest positive explicit settlement", () => {
    const cash = { requestId: "cash", employeeId: "worker", currency: "DZD", paymentDate: "2026-11-10T00:00:00.000Z", advance: null };
    for (const amount of ["0", "0.0", "0.00"]) {
      const result = exactSalaryCashInputSchema.safeParse({ ...cash, amount, wageAllocations: [] });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === "amount")).toBe(true);
    }
    expect(exactSalaryCashInputSchema.parse({ ...cash, amount: "0.01", wageAllocations: [{ id: "allocation", source: { kind: "EARNING", id: "earning" }, amount: "0.01" }] }).amount).toBe("0.01");
  });

  it("keeps omitted, cleared and zero references distinct without accepting numeric legacy fields", () => {
    expect(exactEmployeeUpdateInputSchema.parse({ id: "worker" })).not.toHaveProperty("salaryReference");
    expect(exactEmployeeUpdateInputSchema.parse({ id: "worker", salaryReference: null }).salaryReference).toBeNull();
    expect(exactEmployeeUpdateInputSchema.parse({ id: "worker", salaryReference: { period: "MONTHLY", amount: "0" } }).salaryReference).toEqual({ period: "MONTHLY", amount: "0.00" });
    expect(exactEmployeeUpdateInputSchema.safeParse({ id: "worker", salaryAmountDzd: 100 }).success).toBe(false);
    expect(exactEmployeeUpdateInputSchema.safeParse({ id: "worker", salaryPeriod: "DAILY" }).success).toBe(false);
    expect(exactEmployeeCreateInputSchema.parse({ firstName: "Test", lastName: "Worker", phone: "0550000000", roleId: "worker" }).salaryReference).toBeUndefined();
    expect(exactEmployeeSalaryPaymentSchema.shape.actualAmountDzd.parse("90071992547409.93")).toBe("90071992547409.93");
    expect(exactEmployeeSalaryPaymentSchema.shape.expectedAmountDzd.safeParse(100).success).toBe(false);
  });
  it("keeps a DAILY reference at four places until final money calculation", () => {
    const reference = exactSalaryReferenceSchema.parse({ period: "DAILY", amount: "1500.125" });
    expect(reference).toEqual({ period: "DAILY", amount: "1500.1250" });
    expect(suggestExactSalaryAmount(reference, 8)).toBe("12001.00");
  });

  it("retains the monthly ratio and legacy weekly behavior without posting earnings", () => {
    expect(suggestExactSalaryAmount({ period: "MONTHLY", amount: "100" }, 1)).toBe("3.33");
    expect(suggestExactSalaryAmount({ period: "MONTHLY", amount: "100" }, 3)).toBe("10.00");
    expect(suggestExactSalaryAmount({ period: "WEEKLY", amount: "100" }, 3)).toBe("100.00");
    expect(suggestExactSalaryAmount(null, 3)).toBeNull();
  });

  it("rejects numeric bridges, wrong reference precision and unsafe days", () => {
    for (const value of [{ period: "MONTHLY", amount: "1.001" }, { period: "DAILY", amount: "1.00001" }, { period: "DAILY", amount: 1250 }, { period: "DAILY", amount: "-1" }]) {
      expect(exactSalaryReferenceSchema.safeParse(value).success).toBe(false);
    }
    for (const days of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      expect(() => suggestExactSalaryAmount({ period: "DAILY", amount: "1" }, days)).toThrow();
    }
    expect(suggestExactSalaryAmount({ period: "DAILY", amount: "1" }, 366)).toBe("366.00");
  });

  it("accepts independent repeated A/B/A amounts with optional days and explicit unallocated earnings", () => {
    const parsed = exactSalaryApprovalInputSchema.parse(approval);
    expect(parsed.segments.map(row => [row.projectId, row.amount])).toEqual([["A", "10000.00"], ["B", "37500.00"], ["A", "15000.00"]]);
    expect(parsed.approvedAmount).toBe("62500.00");
    expect(exactSalaryApprovalInputSchema.parse({ ...approval, segments: [segment("one", "A", "60000")], unallocatedAmount: "2500" }).unallocatedAmount).toBe("2500.00");
  });

  it("rejects mismatched manual allocations instead of redistributing other segments", () => {
    expect(exactSalaryApprovalInputSchema.safeParse({ ...approval, segments: [segment("one", "A", "10000")], unallocatedAmount: "0" }).success).toBe(false);
    expect(approval.segments.map(row => row.amount)).toEqual(["10000", "37500", "15000"]);
    expect(exactSalaryApprovalInputSchema.safeParse({ ...approval, segments: [segment("same", "A", "30000"), segment("same", "B", "32500")] }).success).toBe(false);
  });

  it("validates covered dates, positive optional days, currency, signs and required amounts", () => {
    for (const patch of [{ periodStart: "2026-02-30" }, { periodEnd: "2026-10-31" }, { currency: "EUR" }, { approvedAmount: "-1" }, { approvedAmount: "1e3" }, { unallocatedAmount: undefined }, { segments: [segment("bad", "A", "62500", 0)] }]) {
      expect(exactSalaryApprovalInputSchema.safeParse({ ...approval, ...patch }).success).toBe(false);
    }
  });

  it("distributes only an explicit suggestion target, preserving stable IDs, recorded tie order and its remainder", () => {
    const shares = [{ id: "third", projectId: "A", days: 1 }, { id: "first", projectId: "B", days: 1 }, { id: "second", projectId: "A", days: 1 }];
    expect(suggestExactSalaryAllocations("100", "1", shares)).toEqual({
      segments: [segment("third", "A", "33.00", 1), segment("first", "B", "33.00", 1), segment("second", "A", "33.00", 1)], unallocatedAmount: "1.00",
    });
    expect(suggestExactSalaryAllocations("100", "0", shares).segments.map(row => row.amount)).toEqual(["33.34", "33.33", "33.33"]);
    expect(shares.map(row => row.id)).toEqual(["third", "first", "second"]);
  });

  it("preserves full-range exact amounts and rejects an overflowing suggestion rather than clipping", () => {
    expect(exactSalaryApprovalInputSchema.parse({ ...approval, approvedAmount: "92233720368547758.07", segments: [], unallocatedAmount: "92233720368547758.07" }).approvedAmount).toBe("92233720368547758.07");
    expect(() => suggestExactSalaryAmount({ period: "DAILY", amount: "922337203685477.5807" }, 101)).toThrow();
    expect(() => suggestExactSalaryAllocations("1", "2", [])).toThrow();
  });
});
