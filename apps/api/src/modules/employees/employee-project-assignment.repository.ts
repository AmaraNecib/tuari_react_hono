import type { AssignmentStatus } from "./employee-manager-assignment.entity";
import type {
  EmployeeProjectAssignment,
  EmployeeProjectAssignmentListFilters,
} from "./employee-project-assignment.entity";

export type EmployeeProjectAssignmentWriteInput = {
  id: string;
  employeeId: string;
  projectId: string;
  status: AssignmentStatus;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EmployeeProjectAssignmentUpdateInput = {
  id: string;
  projectId?: string;
  status?: AssignmentStatus;
  startDate?: Date;
  endDate?: Date | null;
  notes?: string | null;
  updatedAt: Date;
};

export type EmployeeProjectAssignmentLookupOptions = {
  includeDeleted?: boolean;
};

export interface EmployeeProjectAssignmentRepository {
  list(
    filters?: EmployeeProjectAssignmentListFilters,
  ): Promise<EmployeeProjectAssignment[]>;
  getById(
    id: string,
    options?: EmployeeProjectAssignmentLookupOptions,
  ): Promise<EmployeeProjectAssignment | null>;
  listActiveByEmployeeId(employeeId: string): Promise<EmployeeProjectAssignment[]>;
  getActiveByEmployeeAndProject(
    employeeId: string,
    projectId: string,
  ): Promise<EmployeeProjectAssignment | null>;
  countActiveByProjectId(projectId: string): Promise<number>;
  create(input: EmployeeProjectAssignmentWriteInput): Promise<EmployeeProjectAssignment>;
  update(input: EmployeeProjectAssignmentUpdateInput): Promise<EmployeeProjectAssignment>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
  endActiveByEmployeeId(employeeId: string, endDate: Date, updatedAt: Date): Promise<number>;
}
