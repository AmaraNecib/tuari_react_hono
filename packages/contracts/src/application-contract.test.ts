import { describe, expect, it } from "vitest";
import { applicationCapabilitiesSchema, applicationContract } from "./application-contract";
import { exactEmployeeContract } from "./employee-exact-contract";
import { exactWorkforceEarningsContract } from "./workforce-exact-contract";

describe("normal application application contract", () => {
  it("replaces the twelve employee methods at their existing top-level names", () => {
    for (const name of Object.keys(exactEmployeeContract)) expect(applicationContract).toHaveProperty(name);
    expect(applicationContract).toHaveProperty("managerAssignmentsList");
    for (const method of ["getRecoveryKeyPool", "generateRecoveryKeys", "consumeRecoveryKey", "revokeRecoveryKey", "changeDbEncryptionKey"]) expect(applicationContract).toHaveProperty(method);
    expect("employees" in applicationContract).toBe(false);
    expect("salaryPaymentsCreate" in applicationContract).toBe(false);
    expect("salaryPaymentsList" in applicationContract).toBe(false);
  });

  it("mounts only approved earnings and project labor procedures", () => {
    expect(Object.keys(exactWorkforceEarningsContract).sort()).toEqual([
      "approveMonthlyEarnings", "getProjectSalaryCost", "listEmployeeEarnings",
    ]);
    expect(Object.keys(applicationContract.workforceExact).sort()).toEqual([
      "approveMonthlyEarnings", "getProjectSalaryCost", "listEmployeeEarnings",
    ]);
  });

  it("advertises fixed feature capability values with a validated workspace UUID", () => {
    expect(applicationContract.applicationCapabilities).toBeDefined();
    const capabilities = {
      workspaceId: "11111111-1111-4111-8111-111111111111", employees: "exact", approvedEarnings: "available", projectLaborCost: "exact-ledger",
      cashPayments: "unavailable", advances: "unavailable", openings: "unavailable", corrections: "unavailable", invoices: "unavailable",
      inventoryMoney: "unavailable", expenses: "unavailable", monetaryReports: "unavailable", fullProjectCost: "unavailable",
    };
    expect(applicationCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(applicationCapabilitiesSchema.safeParse({ ...capabilities, workspaceId: "not-a-workspace-id" }).success).toBe(false);
  });
});
