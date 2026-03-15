import type {
  Employee,
  EmployeeManagerAssignment,
  EmployeeProjectAssignment,
  Project,
  Role,
  Warehouse,
} from "@tuari/contracts";

export type EmployeeStatus = Employee["status"];
export type ProjectStatus = Project["status"];
export type WarehouseStatus = Warehouse["status"];
export type AssignmentStatus = EmployeeManagerAssignment["status"];

export type RoleRecord = Role;
export type EmployeeRecord = Employee;
export type ProjectRecord = Project;
export type WarehouseRecord = Warehouse;
export type EmployeeManagerAssignmentRecord = EmployeeManagerAssignment;
export type EmployeeProjectAssignmentRecord = EmployeeProjectAssignment;

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
  notes?: string | null;
};

export type EmployeeUpdateData = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  roleId?: string;
  status?: EmployeeStatus;
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

export const SYSTEM_ROLE_KEYS = {
  worker: "worker",
  projectManager: "project_manager",
  warehouseManager: "warehouse_manager",
} as const;
