import { describe, expect, it } from "vitest";
import { slice543CapabilitiesSchema, slice543Contract } from "./slice543-contract";
import { exactEmployeeContract } from "./employee-exact-contract";
import { exactWorkforceEarningsContract } from "./workforce-exact-earnings-contract";

describe("slice 543 application contract", () => {
  it("replaces the twelve employee methods at their existing top-level names", () => {
    for (const name of Object.keys(exactEmployeeContract)) expect(slice543Contract).toHaveProperty(name);
    expect(slice543Contract).toHaveProperty("managerAssignmentsList");
    for (const method of ["getRecoveryKeyPool", "generateRecoveryKeys", "consumeRecoveryKey", "revokeRecoveryKey", "changeDbEncryptionKey"]) expect(slice543Contract).toHaveProperty(method);
    expect("employees" in slice543Contract).toBe(false);
    expect("salaryPaymentsCreate" in slice543Contract).toBe(false);
    expect("salaryPaymentsList" in slice543Contract).toBe(false);
  });

  it("mounts only approved earnings and project labor procedures", () => {
    expect(Object.keys(exactWorkforceEarningsContract).sort()).toEqual([
      "approveMonthlyEarnings", "getProjectSalaryCost", "listEmployeeEarnings",
    ]);
    expect(Object.keys(slice543Contract.workforceExact).sort()).toEqual([
      "approveMonthlyEarnings", "getProjectSalaryCost", "listEmployeeEarnings",
    ]);
  });

  it("advertises fixed feature capability values with a validated workspace UUID", () => {
    expect(slice543Contract.slice543Capabilities).toBeDefined();
    const capabilities = {
      workspaceId: "11111111-1111-4111-8111-111111111111", employees: "exact", approvedEarnings: "available", projectLaborCost: "exact-ledger",
      cashPayments: "unavailable", advances: "unavailable", openings: "unavailable", corrections: "unavailable", invoices: "unavailable",
      inventoryMoney: "unavailable", expenses: "unavailable", monetaryReports: "unavailable", fullProjectCost: "unavailable",
    };
    expect(slice543CapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(slice543CapabilitiesSchema.safeParse({ ...capabilities, workspaceId: "not-a-workspace-id" }).success).toBe(false);
  });
});
