import type {
  AssignmentStatus,
  EmployeeManagerAssignment,
  EmployeeManagerAssignmentListFilters,
} from "./employee-manager-assignment.entity";

export type EmployeeManagerAssignmentWriteInput = {
  id: string;
  workerId: string;
  managerId: string;
  status: AssignmentStatus;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EmployeeManagerAssignmentUpdateInput = {
  id: string;
  managerId?: string;
  status?: AssignmentStatus;
  startDate?: Date;
  endDate?: Date | null;
  notes?: string | null;
  updatedAt: Date;
};

export type EmployeeManagerAssignmentLookupOptions = {
  includeDeleted?: boolean;
};

export interface EmployeeManagerAssignmentRepository {
  list(
    filters?: EmployeeManagerAssignmentListFilters,
  ): Promise<EmployeeManagerAssignment[]>;
  getById(
    id: string,
    options?: EmployeeManagerAssignmentLookupOptions,
  ): Promise<EmployeeManagerAssignment | null>;
  getActiveByWorkerId(workerId: string): Promise<EmployeeManagerAssignment | null>;
  countActiveByManagerId(managerId: string): Promise<number>;
  create(input: EmployeeManagerAssignmentWriteInput): Promise<EmployeeManagerAssignment>;
  update(input: EmployeeManagerAssignmentUpdateInput): Promise<EmployeeManagerAssignment>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
  endActiveByWorkerId(workerId: string, endDate: Date, updatedAt: Date): Promise<number>;
}
