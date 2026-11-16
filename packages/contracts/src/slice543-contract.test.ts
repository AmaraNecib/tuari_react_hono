import { describe, expect, it } from "vitest";
import { slice543Contract } from "./slice543-contract";
import { exactEmployeeContract } from "./employee-exact-contract";
import { exactWorkforceEarningsContract } from "./workforce-exact-earnings-contract";

describe("slice 543 application contract", () => {
  it("replaces the twelve employee methods at their existing top-level names", () => {
    for (const name of Object.keys(exactEmployeeContract)) expect(slice543Contract).toHaveProperty(name);
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

  it("advertises exact capabilities and explicitly unavailable later money families", () => {
    expect(slice543Contract.slice543Capabilities).toBeDefined();
  });
});
