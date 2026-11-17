import { describe, expect, it } from "vitest";

import { employeeEarningApprovalInputSchema, employeeSalaryReferenceSchema } from "./workforce";

describe("employee earning approval contract", () => {
  it("accepts ordered repeated-project segments with explicit exact amounts", () => {
    const input = {
      employeeId: "employee-1",
      requestId: "d0f2fd98-5ca5-49ae-9074-b139df26614d",
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-04-26T00:00:00.000Z",
      currencyCode: "DZD",
      totalAmount: "62500.00",
      unallocatedAmount: "0.00",
      segments: [
        { id: "segment-a1", projectId: "project-a", amount: "10000.00" },
        { id: "segment-b", projectId: "project-b", amount: "37500.00" },
        { id: "segment-a2", projectId: "project-a", amount: "15000.00" },
      ],
    };

    expect(employeeEarningApprovalInputSchema.parse(input)).toEqual(input);
  });

  it("allows a partial covered period and an explicit unallocated remainder", () => {
    const approval = employeeEarningApprovalInputSchema.parse({
      employeeId: "employee-1",
      requestId: "f60d08ef-79d6-4e10-9555-a7e4e84ac84a",
      periodStart: "2026-04-10T00:00:00.000Z",
      periodEnd: "2026-04-11T00:00:00.000Z",
      currencyCode: "DZD",
      totalAmount: "0.75",
      unallocatedAmount: "0.25",
      segments: [{ id: "segment-one", projectId: "project-a", amount: "0.50" }],
    });

    expect(approval.totalAmount).toBe("0.75");
    expect(approval.unallocatedAmount).toBe("0.25");
    expect(approval.segments).toHaveLength(1);
  });

  it("validates optional reference salaries at their declared exact scale", () => {
    expect(employeeSalaryReferenceSchema.parse({ period: "DAILY", amount: "1250.1250" })).toEqual({
      period: "DAILY", amount: "1250.1250",
    });
    expect(employeeSalaryReferenceSchema.safeParse({ period: "MONTHLY", amount: "1250.1250" }).success).toBe(false);
    expect(employeeSalaryReferenceSchema.safeParse({ period: "WEEKLY", amount: "not-money" }).success).toBe(false);
  });

  it("rejects non-decimal money, duplicate segment identities, unbalanced totals, and invalid periods", () => {
    const input = {
      employeeId: "employee-1",
      requestId: "d0f2fd98-5ca5-49ae-9074-b139df26614d",
      periodStart: "2026-04-26T00:00:00.000Z",
      periodEnd: "2026-04-01T00:00:00.000Z",
      currencyCode: "DZD",
      totalAmount: "1e3",
      unallocatedAmount: "0.00",
      segments: [
        { id: "same-id", projectId: "project-a", amount: "1.00" },
        { id: "same-id", projectId: "project-b", amount: "1.00" },
      ],
    };

    expect(employeeEarningApprovalInputSchema.safeParse(input).success).toBe(false);
  });
});
