import { describe, expect, it } from "vitest";
import { exactEmployeeContract } from "./employee-exact-contract";
import { exactEmployeeSchema, exactEmployeeStateHistorySchema } from "./workforce-exact";

const employee = { id: "worker", firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "role", status: "ACTIVE", salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" }, currency: "DZD", notes: null, occupation: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" };
describe("exact employee root replacement contract", () => {
  it("preserves concrete top-level employee method names without a numeric or restore namespace", () => {
    expect(Object.keys(exactEmployeeContract).sort()).toEqual(["employeesList", "employeesListPaged", "employeesGet", "employeesCreate", "employeesBatchCreate", "employeesUpdate", "employeesSave", "employeesDelete", "employeesAssignWorkplace", "employeesSyncManagedProjects", "employeesSyncManagedWarehouses", "employeeStateHistoryList"].sort());
    expect(exactEmployeeSchema.parse(employee).salaryReference?.amount).toBe("9007199254740993.21");
    expect(exactEmployeeStateHistorySchema.parse({ id: "history", employeeId: "worker", roleId: "role", status: "ACTIVE", salaryReference: { period: "DAILY", amount: "0.0001" }, currency: "DZD", eventType: "CREATED", startDate: employee.createdAt, endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: employee.createdAt, updatedAt: employee.updatedAt }).salaryReference).toEqual({ period: "DAILY", amount: "0.0001" });
  });
});
