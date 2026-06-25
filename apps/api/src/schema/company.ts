import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { role } from "./app";

/**
 * Company domain tables (employee, project, warehouse, assignments, etc.).
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */

export const employee = sqliteTable("employee", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull().unique(),
  roleId: text("role_id")
    .notNull()
    .references(() => role.id),
  status: text("status").notNull(),
  salaryAmountDzd: real("salary_amount_dzd"),
  salaryPeriod: text("salary_period"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  managerId: text("manager_id").references(() => employee.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const warehouse = sqliteTable("warehouse", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  managerId: text("manager_id").references(() => employee.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const employeeManagerAssignment = sqliteTable(
  "employee_manager_assignment",
  {
    id: text("id").primaryKey(),
    workerId: text("worker_id")
      .notNull()
      .references(() => employee.id),
    managerId: text("manager_id")
      .notNull()
      .references(() => employee.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const employeeProjectAssignment = sqliteTable(
  "employee_project_assignment",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const employeeWarehouseAssignment = sqliteTable(
  "employee_warehouse_assignment",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouse.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const employeeStateHistory = sqliteTable(
  "employee_state_history",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id),
    roleId: text("role_id")
      .notNull()
      .references(() => role.id),
    status: text("status").notNull(),
    salaryAmountDzd: real("salary_amount_dzd"),
    salaryPeriod: text("salary_period"),
    eventType: text("event_type").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const projectManagerOwnershipHistory = sqliteTable(
  "project_manager_ownership_history",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id),
    managerId: text("manager_id")
      .notNull()
      .references(() => employee.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const warehouseManagerOwnershipHistory = sqliteTable(
  "warehouse_manager_ownership_history",
  {
    id: text("id").primaryKey(),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouse.id),
    managerId: text("manager_id")
      .notNull()
      .references(() => employee.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const employeeSalaryPayment = sqliteTable(
  "employee_salary_payment",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id),
    periodType: text("period_type").notNull(),
    expectedAmountDzd: real("expected_amount_dzd").notNull(),
    actualAmountDzd: real("actual_amount_dzd").notNull(),
    paymentDate: text("payment_date").notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const externalCounterparty = sqliteTable("external_counterparty", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const debtAccount = sqliteTable("debt_account", {
  id: text("id").primaryKey(),
  partyType: text("party_type").notNull(),
  workerId: text("worker_id").references(() => employee.id),
  externalCounterpartyId: text("external_counterparty_id").references(
    () => externalCounterparty.id,
  ),
  status: text("status").notNull(),
  direction: text("direction").notNull().default("PAYABLE"),
  currentBalance: real("current_balance").notNull().default(0),
  note: text("note"),
  settledAt: text("settled_at"),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const debtEntry = sqliteTable("debt_entry", {
  id: text("id").primaryKey(),
  debtAccountId: text("debt_account_id")
    .notNull()
    .references(() => debtAccount.id),
  invoiceId: text("invoice_id"),
  entryType: text("entry_type").notNull(),
  currency: text("currency").notNull().default("DZD"),
  signedAmount: real("signed_amount_dzd").notNull(),
  entryDate: text("entry_date").notNull(),
  note: text("note"),
  balanceAfter: real("balance_after").notNull(),
  reasonCategory: text("reason_category"),
  reasonDetail: text("reason_detail"),
  paymentMethod: text("payment_method"),
  status: text("status").notNull().default("LIVE"),
  voidReason: text("void_reason"),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
