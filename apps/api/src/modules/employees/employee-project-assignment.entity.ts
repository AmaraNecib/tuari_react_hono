import type { EmployeeReference, ProjectReference } from "./employee.entity";
import type { AssignmentStatus } from "./employee-manager-assignment.entity";

export type EmployeeProjectAssignment = {
  id: string;
  employeeId: string;
  projectId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  employee: EmployeeReference;
  project: ProjectReference;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type EmployeeProjectAssignmentListFilters = {
  employeeId?: string;
  projectId?: string;
  status?: AssignmentStatus;
  includeDeleted?: boolean;
};
