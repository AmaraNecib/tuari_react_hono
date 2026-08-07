import { describe, expect, it } from "vitest";

import {
  mapAuthUserDisplay,
  mapDebtAccount,
  mapDebtEntry,
  mapEmployee,
  mapEmployeeSalaryPayment,
  mapEmployeeStateHistory,
  mapExternalCounterparty,
  mapManagerAssignment,
  mapProject,
  mapProjectAssignment,
  mapProjectManagerOwnershipHistory,
  mapRole,
  mapUserProfileHistory,
  mapWarehouse,
  mapWarehouseAssignment,
  mapWarehouseManagerOwnershipHistory,
  normalizeAuditContext,
  toNullableText,
  type SqliteRow,
} from "./company.repository-mappers";

const baseRow: SqliteRow = {
  id: "row-1",
  name: "name",
  key: "worker",
  description: "desc",
  is_system: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  first_name: "أحمد",
  last_name: "بن علي",
  phone: "0550123456",
  role_id: "role-1",
  status: "ACTIVE",
  salary_amount_dzd: 50000,
  salary_period: "MONTHLY",
  notes: "ملاحظة",
  location: "الجزائر",
  manager_id: "manager-1",
  address: "حي 1",
  worker_id: "worker-1",
  start_date: "2026-01-01T00:00:00.000Z",
  end_date: "2026-06-01T00:00:00.000Z",
  actor_user_id: "user-1",
  actor_label: "مدير",
  transaction_id: "tx-1",
  employee_id: "employee-1",
  project_id: "project-1",
  warehouse_id: "warehouse-1",
  event_type: "CREATED",
  period_type: "MONTHLY",
  expected_amount_dzd: 50000,
  actual_amount_dzd: 45000,
  payment_date: "2026-01-05T00:00:00.000Z",
  note: "دفعة",
  full_name: "شركة الأمل",
  phone_number: "021123456",
  phoneNumber: "0550123456",
  party_type: "INTERNAL_WORKER",
  external_counterparty_id: null,
  current_balance: 1000,
  direction: "PAYABLE",
  settled_at: "2026-03-01T00:00:00.000Z",
  debt_account_id: "account-1",
  entry_type: "OPENING",
  signed_amount: 1000,
  entry_date: "2026-01-01T00:00:00.000Z",
  balance_after: 1000,
  reason_category: "INVOICE_DRIVEN",
  reason_detail: "سبب",
  payment_method: "CASH",
  voided_at: "2026-02-01T00:00:00.000Z",
  voided_by: "user-2",
  void_reason: "خطأ",
  user_id: "user-1",
  previous_name: "الاسم القديم",
  previous_phone: "0111111111",
  password_changed: 1,
};

describe("toNullableText", () => {
  it("returns trimmed non-empty strings and null otherwise", () => {
    expect(toNullableText("  x  ")).toBe("x");
    expect(toNullableText("   ")).toBeNull();
    expect(toNullableText("")).toBeNull();
    expect(toNullableText(null)).toBeNull();
    expect(toNullableText(undefined)).toBeNull();
    expect(toNullableText(42)).toBeNull();
  });
});

describe("normalizeAuditContext", () => {
  it("fills missing fields with nulls and a fresh transaction id", () => {
    expect(normalizeAuditContext()).toMatchObject({ actorUserId: null, actorLabel: null });
    expect(normalizeAuditContext(undefined).transactionId).toBeTruthy();
    expect(
      normalizeAuditContext({ actorUserId: "u", actorLabel: "l", transactionId: "t" }),
    ).toEqual({ actorUserId: "u", actorLabel: "l", transactionId: "t" });
  });
});

describe("repository mappers", () => {
  it("mapRole maps all fields", () => {
    expect(mapRole(baseRow)).toEqual({
      id: "row-1",
      key: "worker",
      name: "name",
      description: "desc",
      isSystem: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("mapEmployee maps salary + nullable fields", () => {
    const employee = mapEmployee(baseRow);
    expect(employee.firstName).toBe("أحمد");
    expect(employee.lastName).toBe("بن علي");
    expect(employee.phone).toBe("0550123456");
    expect(employee.roleId).toBe("role-1");
    expect(employee.status).toBe("ACTIVE");
    expect(employee.salaryAmountDzd).toBe(50000);
    expect(employee.salaryPeriod).toBe("MONTHLY");
    expect(employee.notes).toBe("ملاحظة");

    const sparse = mapEmployee({ ...baseRow, salary_amount_dzd: null, salary_period: null, notes: null });
    expect(sparse.salaryAmountDzd).toBeNull();
    expect(sparse.salaryPeriod).toBeNull();
    expect(sparse.notes).toBeNull();
  });

  it("mapProject maps location/manager/status", () => {
    const project = mapProject(baseRow);
    expect(project.name).toBe("name");
    expect(project.location).toBe("الجزائر");
    expect(project.managerId).toBe("manager-1");
    expect(project.status).toBe("ACTIVE");
    expect(mapProject({ ...baseRow, location: null, manager_id: null, notes: null })).toMatchObject({
      location: null,
      managerId: null,
      notes: null,
    });
  });

  it("mapWarehouse maps address/manager/status", () => {
    const warehouse = mapWarehouse(baseRow);
    expect(warehouse.address).toBe("حي 1");
    expect(warehouse.managerId).toBe("manager-1");
    expect(warehouse.status).toBe("ACTIVE");
    expect(mapWarehouse({ ...baseRow, address: null, manager_id: null })).toMatchObject({
      address: null,
      managerId: null,
    });
  });

  it("mapManagerAssignment maps endDate + audit fields", () => {
    const assignment = mapManagerAssignment(baseRow);
    expect(assignment.workerId).toBe("worker-1");
    expect(assignment.managerId).toBe("manager-1");
    expect(assignment.endDate).toBe("2026-06-01T00:00:00.000Z");
    expect(assignment.actorUserId).toBe("user-1");
    expect(assignment.actorLabel).toBe("مدير");
    expect(assignment.transactionId).toBe("tx-1");
    expect(mapManagerAssignment({ ...baseRow, end_date: null, actor_user_id: null, actor_label: null, transaction_id: null })).toMatchObject({
      endDate: null,
      actorUserId: null,
      actorLabel: null,
      transactionId: null,
    });
  });

  it("mapProjectAssignment maps endDate + audit fields", () => {
    const assignment = mapProjectAssignment(baseRow);
    expect(assignment.employeeId).toBe("employee-1");
    expect(assignment.projectId).toBe("project-1");
    expect(assignment.endDate).toBe("2026-06-01T00:00:00.000Z");
    expect(mapProjectAssignment({ ...baseRow, end_date: null })).toMatchObject({ endDate: null });
  });

  it("mapWarehouseAssignment maps endDate + audit fields", () => {
    const assignment = mapWarehouseAssignment(baseRow);
    expect(assignment.employeeId).toBe("employee-1");
    expect(assignment.warehouseId).toBe("warehouse-1");
    expect(assignment.endDate).toBe("2026-06-01T00:00:00.000Z");
    expect(mapWarehouseAssignment({ ...baseRow, end_date: null })).toMatchObject({ endDate: null });
  });

  it("mapEmployeeStateHistory maps salary + nullable fields", () => {
    const history = mapEmployeeStateHistory(baseRow);
    expect(history.employeeId).toBe("employee-1");
    expect(history.roleId).toBe("role-1");
    expect(history.status).toBe("ACTIVE");
    expect(history.salaryAmountDzd).toBe(50000);
    expect(history.salaryPeriod).toBe("MONTHLY");
    expect(history.eventType).toBe("CREATED");
    expect(history.endDate).toBe("2026-06-01T00:00:00.000Z");
    expect(
      mapEmployeeStateHistory({ ...baseRow, salary_amount_dzd: null, salary_period: null, end_date: null }),
    ).toMatchObject({ salaryAmountDzd: null, salaryPeriod: null, endDate: null });
  });

  it("mapProjectManagerOwnershipHistory maps nullable fields", () => {
    const history = mapProjectManagerOwnershipHistory(baseRow);
    expect(history.projectId).toBe("project-1");
    expect(history.managerId).toBe("manager-1");
    expect(history.endDate).toBe("2026-06-01T00:00:00.000Z");
    expect(mapProjectManagerOwnershipHistory({ ...baseRow, end_date: null, notes: null })).toMatchObject({
      endDate: null,
      notes: null,
    });
  });

  it("mapWarehouseManagerOwnershipHistory maps nullable fields", () => {
    const history = mapWarehouseManagerOwnershipHistory(baseRow);
    expect(history.warehouseId).toBe("warehouse-1");
    expect(history.managerId).toBe("manager-1");
    expect(history.endDate).toBe("2026-06-01T00:00:00.000Z");
    expect(mapWarehouseManagerOwnershipHistory({ ...baseRow, end_date: null })).toMatchObject({
      endDate: null,
    });
  });

  it("mapEmployeeSalaryPayment maps payment fields", () => {
    const payment = mapEmployeeSalaryPayment(baseRow);
    expect(payment.employeeId).toBe("employee-1");
    expect(payment.periodType).toBe("MONTHLY");
    expect(payment.expectedAmountDzd).toBe(50000);
    expect(payment.actualAmountDzd).toBe(45000);
    expect(payment.paymentDate).toBe("2026-01-05T00:00:00.000Z");
    expect(payment.note).toBe("دفعة");
  });

  it("mapExternalCounterparty maps fields", () => {
    const counterparty = mapExternalCounterparty(baseRow);
    expect(counterparty.fullName).toBe("شركة الأمل");
    expect(counterparty.phoneNumber).toBe("021123456");
    expect(counterparty.note).toBe("دفعة");
    expect(mapExternalCounterparty({ ...baseRow, note: null })).toMatchObject({ note: null });
  });

  it("mapDebtAccount maps direction/balance defaults and nullable party refs", () => {
    const account = mapDebtAccount(baseRow);
    expect(account.partyType).toBe("INTERNAL_WORKER");
    expect(account.workerId).toBe("worker-1");
    expect(account.externalCounterpartyId).toBeNull();
    expect(account.status).toBe("ACTIVE");
    expect(account.direction).toBe("PAYABLE");
    expect(account.currentBalance).toBe(1000);
    expect(account.settledAt).toBe("2026-03-01T00:00:00.000Z");

    const defaults = mapDebtAccount({
      ...baseRow,
      worker_id: null,
      external_counterparty_id: "cp-1",
      direction: null,
      current_balance: null,
      settled_at: null,
    });
    expect(defaults.workerId).toBeNull();
    expect(defaults.externalCounterpartyId).toBe("cp-1");
    expect(defaults.direction).toBe("PAYABLE");
    expect(defaults.currentBalance).toBe(0);
    expect(defaults.settledAt).toBeNull();
  });

  it("mapDebtEntry maps reason/payment/status defaults and nullable audit fields", () => {
    const entry = mapDebtEntry({ ...baseRow, status: "LIVE" });
    expect(entry.debtAccountId).toBe("account-1");
    expect(entry.entryType).toBe("OPENING");
    expect(entry.signedAmountDzd).toBe(1000);
    expect(entry.balanceAfterDzd).toBe(1000);
    expect(entry.reasonCategory).toBe("INVOICE_DRIVEN");
    expect(entry.paymentMethod).toBe("CASH");
    expect(entry.status).toBe("LIVE");
    expect(entry.voidedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(entry.voidedBy).toBe("user-2");
    expect(entry.voidReason).toBe("خطأ");

    const defaults = mapDebtEntry({
      ...baseRow,
      reason_category: null,
      reason_detail: null,
      payment_method: null,
      status: null,
      voided_at: null,
      voided_by: null,
      void_reason: null,
    });
    expect(defaults.reasonCategory).toBe("INVOICE_DRIVEN");
    expect(defaults.reasonDetail).toBeNull();
    expect(defaults.paymentMethod).toBeNull();
    expect(defaults.status).toBe("LIVE");
    expect(defaults.voidedAt).toBeNull();
    expect(defaults.voidedBy).toBeNull();
    expect(defaults.voidReason).toBeNull();
  });

  it("mapUserProfileHistory maps password flag and nullable fields", () => {
    const history = mapUserProfileHistory(baseRow);
    expect(history.userId).toBe("user-1");
    expect(history.name).toBe("name");
    expect(history.previousName).toBe("الاسم القديم");
    expect(history.previousPhone).toBe("0111111111");
    expect(history.passwordChanged).toBe(true);
    expect(
      mapUserProfileHistory({ ...baseRow, name: null, previous_name: null, previous_phone: null, password_changed: null }),
    ).toMatchObject({ name: null, previousName: null, previousPhone: null, passwordChanged: false });
  });

  it("mapAuthUserDisplay maps name/phone", () => {
    expect(mapAuthUserDisplay(baseRow)).toEqual({ id: "row-1", name: "name", phone: "0550123456" });
    expect(mapAuthUserDisplay({ ...baseRow, name: null, phoneNumber: null })).toEqual({
      id: "row-1",
      name: null,
      phone: null,
    });
  });
});
