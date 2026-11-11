import { describe, expect, it } from "vitest";
import { exactEmployeeBatchCreateInputSchema, exactEmployeeSaveInputSchema } from "./workforce-exact";

const profile = { firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role" };
describe("exact employee batch and atomic-save contracts", () => {
  it("keeps exact reference amounts and opt-in relationships without accepting legacy numeric salary fields", () => {
    const batch = exactEmployeeBatchCreateInputSchema.parse({ employees: [{ ...profile, salaryReference: { period: "DAILY", amount: "0.0001" }, managerId: "manager", projectId: "project" }] });
    expect(batch.employees[0]?.salaryReference).toEqual({ period: "DAILY", amount: "0.0001" });
    expect(exactEmployeeBatchCreateInputSchema.safeParse({ employees: [{ ...profile, salaryAmountDzd: 1 }] }).success).toBe(false);
    expect(exactEmployeeBatchCreateInputSchema.safeParse({ employees: [profile, profile] }).success).toBe(false);
    expect(exactEmployeeSaveInputSchema.parse({ id: "worker", notes: "changed" })).not.toHaveProperty("placement");
    expect(exactEmployeeSaveInputSchema.parse({ id: "worker", salaryReference: null, placement: null, managedProjectIds: [] })).toEqual({ id: "worker", salaryReference: null, placement: null, managedProjectIds: [] });
    expect(exactEmployeeSaveInputSchema.safeParse({ id: "worker", salaryAmountDzd: 0, salaryPeriod: "DAILY" }).success).toBe(false);
  });
});
