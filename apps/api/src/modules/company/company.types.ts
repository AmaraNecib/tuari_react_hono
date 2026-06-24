import type {
  DebtAccount,
  DebtPartyDetail,
  DebtPartySummaryItem,
  DebtEntry,
  DebtSummaryItem,
  Employee,
  EmployeeManagerAssignment,
  EmployeeProjectAssignment,
  EmployeeSalaryPayment,
  EmployeeStateHistory,
  EmployeeWarehouseAssignment,
  ExternalCounterparty,
  Project,
  ProjectManagerOwnershipHistory,
  Role,
  SystemLogEntry,
  Warehouse,
  WarehouseManagerOwnershipHistory,
} from "@tuari/contracts";

export type EmployeeStatus = Employee["status"];
export type ProjectStatus = Project["status"];
export type WarehouseStatus = Warehouse["status"];
export type AssignmentStatus = EmployeeManagerAssignment["status"];

export type RoleRecord = Role;
export type EmployeeRecord = Employee;
export type ProjectRecord = Project;
export type WarehouseRecord = Warehouse;
export type ExternalCounterpartyRecord = ExternalCounterparty;
export type DebtAccountRecord = DebtAccount & AuditSnapshot;
export type DebtEntryRecord = DebtEntry & AuditSnapshot;
export type DebtPartyDetailRecord = DebtPartyDetail;
export type DebtPartySummaryItemRecord = DebtPartySummaryItem;
export type DebtSummaryItemRecord = DebtSummaryItem;
type AuditSnapshot = {
  actorLabel?: string | null;
};

export type EmployeeManagerAssignmentRecord = EmployeeManagerAssignment & AuditSnapshot;
export type EmployeeProjectAssignmentRecord = EmployeeProjectAssignment & AuditSnapshot;
export type EmployeeWarehouseAssignmentRecord = EmployeeWarehouseAssignment & AuditSnapshot;
export type EmployeeStateHistoryRecord = EmployeeStateHistory & AuditSnapshot;
export type ProjectManagerOwnershipHistoryRecord = ProjectManagerOwnershipHistory & AuditSnapshot;
export type WarehouseManagerOwnershipHistoryRecord = WarehouseManagerOwnershipHistory & AuditSnapshot;
export type EmployeeSalaryPaymentRecord = EmployeeSalaryPayment & AuditSnapshot;
export type SystemLogEntryRecord = SystemLogEntry;

export type AuthUserDisplayRecord = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type UserProfileHistoryRecord = {
  id: string;
  userId: string;
  name: string | null;
  phone: string | null;
  previousName: string | null;
  previousPhone: string | null;
  passwordChanged: boolean;
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MutationAuditContext = {
  actorUserId?: string | null;
  actorLabel?: string | null;
  transactionId?: string | null;
};

export type InventoryItemDefinitionAuditRecord = {
  id: string;
  name: string;
  itemType: "CONSUMABLE" | "ASSET";
  unit: string | null;
  description: string | null;
  isActive: boolean;
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoleCreateData = {
  key: string;
  name: string;
  description?: string | null;
};

export type RoleUpdateData = {
  id: string;
  key?: string;
  name?: string;
  description?: string | null;
};

export type EmployeeCreateData = {
  firstName: string;
  lastName: string;
  phone: string;
  roleId: string;
  status: EmployeeStatus;
  salaryAmountDzd?: number | null;
  salaryPeriod?: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  notes?: string | null;
};

export type EmployeeBatchCreateData = EmployeeCreateData & {
  managerId?: string | null;
  projectId?: string | null;
};

export type EmployeeBatchCreateResultRecord = {
  employees: EmployeeRecord[];
  managerAssignments: EmployeeManagerAssignmentRecord[];
  projectAssignments: EmployeeProjectAssignmentRecord[];
};

export type EmployeeUpdateData = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  roleId?: string;
  status?: EmployeeStatus;
  salaryAmountDzd?: number | null;
  salaryPeriod?: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  notes?: string | null;
};

export type ProjectCreateData = {
  name: string;
  location?: string | null;
  managerId?: string | null;
  status: ProjectStatus;
  notes?: string | null;
};

export type ProjectUpdateData = {
  id: string;
  name?: string;
  location?: string | null;
  managerId?: string | null;
  reassignWorkerIds?: string[];
  status?: ProjectStatus;
  notes?: string | null;
};

export type WarehouseCreateData = {
  name: string;
  address?: string | null;
  managerId?: string | null;
  status: WarehouseStatus;
  notes?: string | null;
};

export type WarehouseUpdateData = {
  id: string;
  name?: string;
  address?: string | null;
  managerId?: string | null;
  status?: WarehouseStatus;
  notes?: string | null;
};

export type ManagerAssignmentCreateData = {
  workerId: string;
  managerId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
};

export type ManagerAssignmentEndData = {
  id: string;
  endDate: string;
  notes?: string | null;
};

export type ProjectAssignmentCreateData = {
  employeeId: string;
  projectId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
};

export type ProjectAssignmentEndData = {
  id: string;
  endDate: string;
  notes?: string | null;
};

export type EmployeeWorkplaceAssignmentData = {
  employeeId: string;
  nextType: "NONE" | "PROJECT" | "WAREHOUSE";
  managerId?: string | null;
  projectId?: string | null;
  warehouseId?: string | null;
  notes?: string | null;
};

export type EmployeeManagedProjectsSyncData = {
  employeeId: string;
  projectIds: string[];
};

export type EmployeeManagedWarehousesSyncData = {
  employeeId: string;
  warehouseIds: string[];
};

export type WarehouseAssignmentCreateData = {
  employeeId: string;
  warehouseId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
};

export type WarehouseAssignmentEndData = {
  id: string;
  endDate: string;
  notes?: string | null;
};

export type EmployeeSalaryPaymentCreateData = {
  employeeId: string;
  periodType: "DAILY" | "WEEKLY" | "MONTHLY";
  expectedAmountDzd: number;
  actualAmountDzd: number;
  paymentDate: string;
  note?: string | null;
};

export type ExternalCounterpartyCreateData = {
  fullName: string;
  phoneNumber: string;
  note?: string | null;
};

export type ExternalCounterpartyListFilters = {
  fullName?: string;
};

export type DebtAccountCreateData = {
  partyType: DebtAccountRecord["partyType"];
  workerId?: string | null;
  externalCounterpartyId?: string | null;
  status: DebtAccountRecord["status"];
  direction: DebtAccountRecord["direction"];
  currentBalance: number;
  note?: string | null;
  settledAt?: string | null;
};

export type DebtAccountListFilters = {
  partyType?: DebtAccountRecord["partyType"];
  workerId?: string;
  externalCounterpartyId?: string;
  direction?: DebtAccountRecord["direction"];
  status?: DebtAccountRecord["status"];
};

export type DebtAccountUpdateData = {
  id: string;
  status: DebtAccountRecord["status"];
  currentBalance: number;
  settledAt?: string | null;
};

export type DebtEntryCreateData = {
  debtAccountId: string;
  entryType: DebtEntryRecord["entryType"];
  signedAmountDzd: number;
  entryDate: string;
  note?: string | null;
  balanceAfterDzd: number;
  reasonCategory?: DebtEntryRecord["reasonCategory"];
  reasonDetail?: DebtEntryRecord["reasonDetail"];
  paymentMethod?: DebtEntryRecord["paymentMethod"];
  status?: DebtEntryRecord["status"];
  voidedAt?: DebtEntryRecord["voidedAt"];
  voidedBy?: DebtEntryRecord["voidedBy"];
  voidReason?: DebtEntryRecord["voidReason"];
};

export type DebtEntryVoidData = {
  id: string;
  voidedAt: string;
  voidedBy?: string | null;
  voidReason: string;
};

export type EmployeeListFilters = {
  roleId?: string;
  status?: EmployeeStatus;
};

export type ProjectListFilters = {
  managerId?: string;
  status?: ProjectStatus;
};

export type WarehouseListFilters = {
  managerId?: string;
  status?: WarehouseStatus;
};

export type ManagerAssignmentListFilters = {
  workerId?: string;
  managerId?: string;
  status?: AssignmentStatus;
};

export type ProjectAssignmentListFilters = {
  employeeId?: string;
  projectId?: string;
  status?: AssignmentStatus;
};

export type WarehouseAssignmentListFilters = {
  employeeId?: string;
  warehouseId?: string;
  status?: AssignmentStatus;
};

export type EmployeeStateHistoryListFilters = {
  employeeId?: string;
};

export type ProjectManagerOwnershipHistoryListFilters = {
  managerId?: string;
  projectId?: string;
};

export type WarehouseManagerOwnershipHistoryListFilters = {
  managerId?: string;
  warehouseId?: string;
};

export type EmployeeSalaryPaymentListFilters = {
  employeeId?: string;
};

export type DebtEntryListFilters = {
  debtAccountId: string;
};

export type SystemLogListFilters = {
  actionType?: SystemLogEntryRecord["actionType"];
  actorUserId?: string;
  entityId?: string;
  entityType?: SystemLogEntryRecord["entityType"];
  fromDate?: string;
  toDate?: string;
};

export const SYSTEM_ROLE_KEYS = {
  worker: "worker",
  projectManager: "project_manager",
  warehouseManager: "warehouse_manager",
} as const;
