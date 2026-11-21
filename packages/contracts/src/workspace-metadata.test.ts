import { describe, expect, it } from "vitest";
import { workspaceMetadataSchema } from "./workspace";

const metadata = {
  roles: [], employees: [], externalCounterparties: [], projects: [], warehouses: [],
  managerAssignments: [], projectAssignments: [], warehouseAssignments: [],
  employeeStateHistory: [], projectManagerOwnershipHistory: [], warehouseManagerOwnershipHistory: [],
};

describe("workspace metadata contract", () => {
  it("contains organizational metadata without an embedded financial snapshot", () => {
    expect(workspaceMetadataSchema.parse(metadata)).toEqual(metadata);
  });
  it.each(["debtAccounts", "debtEntries", "salaryPayments"])("rejects retired monetary collection %s rather than stripping it", key => {
    expect(workspaceMetadataSchema.safeParse({ ...metadata, [key]: [] }).success).toBe(false);
  });
});
