import type {
  DebtAccountRecord,
  DebtEntryRecord,
  AuthUserDisplayRecord,
  EmployeeManagerAssignmentRecord,
  EmployeeProjectAssignmentRecord,
  EmployeeRecord,
  EmployeeSalaryPaymentRecord,
  EmployeeStateHistoryRecord,
  EmployeeWarehouseAssignmentRecord,
  ExternalCounterpartyRecord,
  MutationAuditContext,
  ProjectManagerOwnershipHistoryRecord,
  ProjectRecord,
  RoleRecord,
  UserProfileHistoryRecord,
  WarehouseManagerOwnershipHistoryRecord,
  WarehouseRecord,
} from "./company.types"

export type SqliteRow = Record<string, null | number | string>

export function toNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
  return {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
}

export function mapRole(row: SqliteRow): RoleRecord {
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name),
    description: toNullableText(row.description),
    isSystem: Number(row.is_system) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapEmployee(row: SqliteRow): EmployeeRecord {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    phone: String(row.phone),
    roleId: String(row.role_id),
    status: String(row.status) as EmployeeRecord["status"],
    salaryAmountDzd: row.salary_amount_dzd === null || row.salary_amount_dzd === undefined ? null : Number(row.salary_amount_dzd),
    salaryPeriod: row.salary_period ? String(row.salary_period) as EmployeeRecord["salaryPeriod"] : null,
    notes: toNullableText(row.notes),
    occupation: toNullableText(row.occupation),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapProject(row: SqliteRow): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    location: toNullableText(row.location),
    managerId: row.manager_id ? String(row.manager_id) : null,
    status: String(row.status) as ProjectRecord["status"],
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapWarehouse(row: SqliteRow): WarehouseRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    address: toNullableText(row.address),
    managerId: row.manager_id ? String(row.manager_id) : null,
    status: String(row.status) as WarehouseRecord["status"],
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapManagerAssignment(row: SqliteRow): EmployeeManagerAssignmentRecord {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    managerId: String(row.manager_id),
    status: String(row.status) as EmployeeManagerAssignmentRecord["status"],
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapProjectAssignment(row: SqliteRow): EmployeeProjectAssignmentRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    projectId: String(row.project_id),
    status: String(row.status) as EmployeeProjectAssignmentRecord["status"],
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapWarehouseAssignment(row: SqliteRow): EmployeeWarehouseAssignmentRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    warehouseId: String(row.warehouse_id),
    status: String(row.status) as EmployeeWarehouseAssignmentRecord["status"],
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapEmployeeStateHistory(row: SqliteRow): EmployeeStateHistoryRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    roleId: String(row.role_id),
    status: String(row.status),
    salaryAmountDzd: row.salary_amount_dzd === null || row.salary_amount_dzd === undefined ? null : Number(row.salary_amount_dzd),
    salaryPeriod: row.salary_period ? String(row.salary_period) as EmployeeStateHistoryRecord["salaryPeriod"] : null,
    eventType: String(row.event_type),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapProjectManagerOwnershipHistory(row: SqliteRow): ProjectManagerOwnershipHistoryRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    managerId: String(row.manager_id),
    status: String(row.status),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapWarehouseManagerOwnershipHistory(row: SqliteRow): WarehouseManagerOwnershipHistoryRecord {
  return {
    id: String(row.id),
    warehouseId: String(row.warehouse_id),
    managerId: String(row.manager_id),
    status: String(row.status),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapEmployeeSalaryPayment(row: SqliteRow): EmployeeSalaryPaymentRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    periodType: String(row.period_type) as EmployeeSalaryPaymentRecord["periodType"],
    days: row.days === undefined || row.days === null ? 30 : Number(row.days),
    expectedAmountDzd: Number(row.expected_amount_dzd),
    actualAmountDzd: Number(row.actual_amount_dzd),
    projectSplits: [],
    paymentDate: String(row.payment_date),
    note: toNullableText(row.note),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapExternalCounterparty(row: SqliteRow): ExternalCounterpartyRecord {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    phoneNumber: String(row.phone_number),
    note: toNullableText(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapDebtAccount(row: SqliteRow): DebtAccountRecord {
  return {
    id: String(row.id),
    partyType: String(row.party_type) as DebtAccountRecord["partyType"],
    workerId: row.worker_id ? String(row.worker_id) : null,
    externalCounterpartyId: row.external_counterparty_id ? String(row.external_counterparty_id) : null,
    status: String(row.status) as DebtAccountRecord["status"],
    direction: String(row.direction ?? "PAYABLE") as DebtAccountRecord["direction"],
    currentBalance: Number(row.current_balance ?? 0),
    note: toNullableText(row.note),
    settledAt: row.settled_at ? String(row.settled_at) : null,
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapDebtEntry(row: SqliteRow): DebtEntryRecord {
  return {
    id: String(row.id),
    debtAccountId: String(row.debt_account_id),
    entryType: String(row.entry_type) as DebtEntryRecord["entryType"],
    signedAmountDzd: Number(row.signed_amount),
    entryDate: String(row.entry_date),
    note: toNullableText(row.note),
    balanceAfterDzd: Number(row.balance_after),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    reasonCategory: (row.reason_category ? String(row.reason_category) : "INVOICE_DRIVEN") as DebtEntryRecord["reasonCategory"],
    reasonDetail: toNullableText(row.reason_detail),
    paymentMethod: (row.payment_method ? String(row.payment_method) : null) as DebtEntryRecord["paymentMethod"],
    status: String(row.status ?? "LIVE") as DebtEntryRecord["status"],
    voidedAt: row.voided_at ? String(row.voided_at) : null,
    voidedBy: toNullableText(row.voided_by),
    voidReason: toNullableText(row.void_reason),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapUserProfileHistory(row: SqliteRow): UserProfileHistoryRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: toNullableText(row.name),
    phone: toNullableText(row.phone),
    previousName: toNullableText(row.previous_name),
    previousPhone: toNullableText(row.previous_phone),
    passwordChanged: Number(row.password_changed ?? 0) === 1,
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapAuthUserDisplay(row: SqliteRow): AuthUserDisplayRecord {
  return {
    id: String(row.id),
    name: toNullableText(row.name),
    phone: toNullableText(row.phoneNumber),
  }
}
