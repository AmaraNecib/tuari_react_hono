import { afterEach, describe, expect, it } from "vitest";

import { CompanyError } from "./company.errors";
import { createAuditContext, createCompanyHarnessTracker } from "./company.test-helpers";

/**
 * CompanyService is a thin facade delegating to the domain services.
 * This file exercises every delegation method so the facade surface is
 * covered; behavior is asserted in the per-service suites.
 */
describe("CompanyService facade delegations", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  afterEach(closeAll);

  const audit = () => createAuditContext();

  it("delegates audit views", () => {
    const { service } = createHarness();
    expect(service.getWorkspaceSnapshot().roles.length).toBeGreaterThanOrEqual(3);
    expect(service.listSystemLog().items).toEqual([]);
    expect(service.listSystemLog({ actionType: "EMPLOYEE_CREATED" }).items).toEqual([]);
  });

  it("delegates role methods including the stubbed role management", () => {
    const { service, roleIds } = createHarness();
    expect(service.listRoles().items.length).toBeGreaterThanOrEqual(3);
    expect(service.getRole(roleIds.worker).item.id).toBe(roleIds.worker);
    expect(() => service.createRole({ key: "k", name: "n" })).toThrowError(CompanyError);
    expect(() => service.updateRole({ id: roleIds.worker })).toThrowError(CompanyError);
    expect(() => service.deleteRole(roleIds.worker)).toThrowError(CompanyError);
  });

  it("delegates employee read methods", () => {
    const { service, roleIds } = createHarness();
    const worker = service.createEmployee({
      firstName: "عامل",
      lastName: "واجهة",
      phone: "0555000001",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    expect(service.listEmployees().items).toHaveLength(1);
    expect(service.listEmployeeStateHistory().items.length).toBeGreaterThan(0);
    expect(service.listProjectManagerOwnershipHistory().items).toEqual([]);
    expect(service.listWarehouseManagerOwnershipHistory().items).toEqual([]);
    expect(service.listSalaryPayments().items).toEqual([]);
    expect(service.getEmployee(worker.id).item.id).toBe(worker.id);
  });

  it("delegates employee mutation methods", () => {
    const { service, roleIds } = createHarness();
    const worker = service.createEmployee({
      firstName: "عامل",
      lastName: "واجهة",
      phone: "0555000002",
      roleId: roleIds.worker,
      status: "ACTIVE",
      salaryAmountDzd: 40000,
      salaryPeriod: "MONTHLY",
    }).item;
    const updated = service.updateEmployee({ id: worker.id, notes: "ملاحظة" }, audit()).item;
    expect(updated.notes).toBe("ملاحظة");
    const withOccupation = service.updateEmployee(
      { id: worker.id, occupation: "عامل بناء" },
      audit(),
    ).item;
    expect(withOccupation.occupation).toBe("عامل بناء");
    const clearedOccupation = service.updateEmployee(
      { id: worker.id, occupation: null },
      audit(),
    ).item;
    expect(clearedOccupation.occupation).toBeNull();
    const paymentTarget = service.createEmployee({
      firstName: "عامل",
      lastName: "رواتب",
      phone: "0555000012",
      roleId: roleIds.worker,
      status: "ACTIVE",
      salaryAmountDzd: 40000,
      salaryPeriod: "MONTHLY",
    }).item;
    service.createSalaryPayment({ employeeId: paymentTarget.id, actualAmountDzd: 40000 }, audit());
    expect(service.deleteEmployee(worker.id, audit()).success).toBe(true);
  });

  it("delegates manager assignment methods", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "مدير",
      lastName: "واجهة",
      phone: "0555000003",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "عامل",
      lastName: "واجهة",
      phone: "0555000004",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const assignment = service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    }).item;
    expect(service.listManagerAssignments().items).toHaveLength(1);
    expect(service.getManagerAssignment(assignment.id).item.id).toBe(assignment.id);
    service.endManagerAssignment({ id: assignment.id, endDate: "2026-06-01T00:00:00.000Z" }, audit());
    expect(service.listManagerAssignments().items[0]?.status).toBe("ENDED");
  });

  it("delegates workplace assignment methods", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "مدير",
      lastName: "واجهة",
      phone: "0555000005",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "عامل",
      lastName: "واجهة",
      phone: "0555000006",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    service.assignEmployeeWorkplace(
      { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: project.id },
      audit(),
    );
    const assignment = service.listProjectAssignments({ employeeId: worker.id }).items[0]!;
    service.endProjectAssignment({ id: assignment.id, endDate: "2026-06-01T00:00:00.000Z" }, audit());
    expect(service.listProjectAssignments().items[0]?.status).toBe("ENDED");
    service.syncManagedProjects({ employeeId: manager.id, projectIds: [project.id] });
    const warehouseManager = service.createEmployee({
      firstName: "مدير",
      lastName: "مخازن واجهة",
      phone: "0555000011",
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }).item;
    service.syncManagedWarehouses({ employeeId: warehouseManager.id, warehouseIds: [] });
  });

  it("delegates project and warehouse methods", () => {
    const { service } = createHarness();
    const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
    const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
    expect(service.listProjects().items).toHaveLength(1);
    expect(service.getProject(project.id).item.id).toBe(project.id);
    expect(service.updateProject({ id: project.id, name: "مشروع محدث" }).item.name).toBe("مشروع محدث");
    expect(service.listWarehouses().items).toHaveLength(1);
    expect(service.getWarehouse(warehouse.id).item.id).toBe(warehouse.id);
    expect(service.updateWarehouse({ id: warehouse.id, name: "مستودع محدث" }).item.name).toBe(
      "مستودع محدث",
    );
    expect(service.listProjectAssignments().items).toEqual([]);
    expect(service.listWarehouseAssignments().items).toEqual([]);
  });

  it("delegates counterparty, debt and finance methods", () => {
    const { service, roleIds } = createHarness();
    const worker = service.createEmployee({
      firstName: "عامل",
      lastName: "دين",
      phone: "0555000007",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const counterparty = service.createExternalCounterparty({
      fullName: "شركة",
      phoneNumber: "0215555555",
    }).item;
    expect(service.listExternalCounterparties().items).toHaveLength(1);
    expect(service.getExternalCounterparty(counterparty.id).item.id).toBe(counterparty.id);
    expect(service.listDebtAccounts().items).toEqual([]);
    expect(service.listDebtsSummary().parties.length).toBe(0);
    const account = service
      .createDebtAccount({ partyType: "INTERNAL_WORKER", workerId: worker.id, openingBalanceDzd: 1000 })
      .item;
    expect(service.getDebtAccount(account.id).item.id).toBe(account.id);
    const entry = service.listDebtEntries({ debtAccountId: account.id }).items[0]!;
    expect(service.getDebtPartyDetail({ partyType: "INTERNAL_WORKER", workerId: worker.id }).item.workerId).toBe(
      worker.id,
    );
    service.recordDebtPayment({ debtEntryId: entry.id, amountDzd: 400, paymentMethod: "CASH" }, audit());
    service.voidDebtEntry({ entryId: entry.id, voidReason: "إلغاء" }, audit());
    expect(service.listDebtsSummary().parties.length).toBeGreaterThan(0);
  });
});
