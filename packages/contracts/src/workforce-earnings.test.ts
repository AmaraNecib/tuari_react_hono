import { describe, expect, it } from "vitest";

import {
  employeeCreateInputSchema,
  employeeEarningApprovalInputSchema,
  employeeSalaryReferenceSchema,
  employeeSchema,
  employeeStateHistorySchema,
  employeeUpdateInputSchema,
} from "./workforce";

describe("employee earning approval contract", () => {
  it("uses an exact salary reference for current employee state and history", () => {
    const salaryReference = { period: "DAILY", amount: "900719925474.0993" };
    const employee = {
      id: "employee-1", firstName: "Ahmed", lastName: "Ali", phone: "0555123456", roleId: "role-worker",
      status: "ACTIVE", salaryReference, notes: null, occupation: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const history = {
      id: "history-1", employeeId: "employee-1", roleId: "role-worker", status: "ACTIVE",
      salaryReference, eventType: "CREATED", startDate: "2026-01-01T00:00:00.000Z", endDate: null,
      notes: null, actorUserId: null, transactionId: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(employeeSchema.parse(employee).salaryReference).toEqual(salaryReference);
    expect(employeeStateHistorySchema.parse(history).salaryReference).toEqual(salaryReference);
    expect(employeeCreateInputSchema.parse({
      firstName: "Ahmed", lastName: "Ali", phone: "0555123456", roleId: "role-worker", salaryReference,
    }).salaryReference).toEqual(salaryReference);
    expect(employeeUpdateInputSchema.parse({ id: "employee-1", salaryReference }).salaryReference).toEqual(salaryReference);
    expect(employeeCreateInputSchema.safeParse({
      firstName: "Ahmed", lastName: "Ali", phone: "0555123456", roleId: "role-worker",
      salaryAmountDzd: 1, salaryPeriod: "DAILY",
    }).success).toBe(false);
  });
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
        { id: "segment-a1", projectId: "project-a", days: 5, amount: "10000.00" },
        { id: "segment-b", projectId: "project-b", days: 15, amount: "37500.00" },
        { id: "segment-a2", projectId: "project-a", days: 5, amount: "15000.00" },
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
      segments: [{ id: "segment-one", projectId: "project-a", days: 1, amount: "0.50" }],
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
    const invalidDaily = employeeSalaryReferenceSchema.safeParse({ period: "DAILY", amount: "1250.12345" });
    expect(invalidDaily.success).toBe(false);
    if (!invalidDaily.success) expect(invalidDaily.error.issues[0]?.message).toBe("مرجع الأجر يجب أن يكون قيمة دقيقة مناسبة للدورية.");
    const invalidType = employeeSalaryReferenceSchema.safeParse({ period: "DAILY", amount: 1250 });
    expect(invalidType.success).toBe(false);
    if (!invalidType.success) expect(invalidType.error.issues[0]?.message).toBe("مبلغ مرجع الأجر يجب أن يكون نصًا عشريًا.");
    const invalidPeriod = employeeSalaryReferenceSchema.safeParse({ period: "YEARLY", amount: "1250.00" });
    expect(invalidPeriod.success).toBe(false);
    if (!invalidPeriod.success) expect(invalidPeriod.error.issues[0]?.message).toBe("دورية الأجر غير صالحة.");
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
