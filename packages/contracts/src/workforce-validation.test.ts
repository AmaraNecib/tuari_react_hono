import { describe, expect, it } from "vitest";

import {
  employeeEarningApprovalInputSchema,
  employeeSalaryReferenceSchema,
} from "./workforce";

const earning = {
  employeeId: "employee-1",
  requestId: "00000000-0000-4000-8000-000000000001",
  periodStart: "2025-01-01T00:00:00.000Z",
  periodEnd: "2025-02-01T00:00:00.000Z",
  currencyCode: "DZD",
  totalAmount: "1000.00",
  unallocatedAmount: "0.00",
  segments: [{ id: "segment-1", projectId: "project-1", days: 1, amount: "1000.00" }],
};

describe("workforce validation identifiers", () => {
  it("reports a stable salary-reference identifier at the amount path", () => {
    const result = employeeSalaryReferenceSchema.safeParse({ period: "MONTHLY", amount: "12.345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        code: "custom",
        path: ["amount"],
        message: "workforce.validation.salaryReference.precision",
      }));
    }
  });

  it("reports stable earning identifiers and paths for days, order, duplicate IDs, and conservation", () => {
    const precision = employeeEarningApprovalInputSchema.safeParse({
      ...earning,
      segments: [{ ...earning.segments[0], amount: "1000.001" }],
    });
    expect(precision.success).toBe(false);
    if (!precision.success) {
      expect(precision.error.issues).toContainEqual(expect.objectContaining({
        path: ["segments", 0, "amount"],
        message: "workforce.validation.earning.amountPrecision",
      }));
    }

    const invalidDays = employeeEarningApprovalInputSchema.safeParse({
      ...earning,
      segments: [{ ...earning.segments[0], days: 0 }],
    });
    expect(invalidDays.success).toBe(false);
    if (!invalidDays.success) {
      expect(invalidDays.error.issues).toContainEqual(expect.objectContaining({
        path: ["segments", 0, "days"],
        message: "workforce.validation.earning.daysPositive",
      }));
    }

    const invalidOrder = employeeEarningApprovalInputSchema.safeParse({
      ...earning,
      periodStart: "2025-02-01T00:00:00.000Z",
      periodEnd: "2025-01-01T00:00:00.000Z",
    });
    expect(invalidOrder.success).toBe(false);
    if (!invalidOrder.success) {
      expect(invalidOrder.error.issues).toContainEqual(expect.objectContaining({
        path: ["periodEnd"],
        message: "workforce.validation.earning.periodOrder",
      }));
    }

    const duplicateIds = employeeEarningApprovalInputSchema.safeParse({
      ...earning,
      segments: [earning.segments[0], { ...earning.segments[0], projectId: "project-2" }],
    });
    expect(duplicateIds.success).toBe(false);
    if (!duplicateIds.success) {
      expect(duplicateIds.error.issues).toContainEqual(expect.objectContaining({
        path: ["segments", 1, "id"],
        message: "workforce.validation.earning.duplicateSegment",
      }));
    }

    const conservation = employeeEarningApprovalInputSchema.safeParse({
      ...earning,
      totalAmount: "1000.01",
    });
    expect(conservation.success).toBe(false);
    if (!conservation.success) {
      expect(conservation.error.issues).toContainEqual(expect.objectContaining({
        path: ["segments"],
        message: "workforce.validation.earning.conservation",
      }));
    }
  });
});
