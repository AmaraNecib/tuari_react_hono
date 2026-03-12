import type { RoleReference } from "../roles/role.entity";
import type { ProjectStatus } from "../projects/project.entity";
import type { AssignmentStatus } from "./employee-manager-assignment.entity";

export const employeeStatuses = [
  "ACTIVE",
  "INACTIVE",
  "LEFT",
] as const;

export type EmployeeStatus = (typeof employeeStatuses)[number];

export type ProjectReference = {
  id: string;
  name: string;
  status: ProjectStatus;
  managerId: string | null;
};

export type ActiveProjectAssignmentSummary = {
  id: string;
  projectId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  project: ProjectReference;
};

export type EmployeeReference = {
  id: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  status: EmployeeStatus;
  role: RoleReference;
};

export type ActiveManagerAssignmentSummary = {
  id: string;
  managerId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  manager: EmployeeReference;
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  phone: string | null;
  roleId: string;
  role: RoleReference;
  status: EmployeeStatus;
  notes: string | null;
  activeManagerAssignment: ActiveManagerAssignmentSummary | null;
  activeProjectAssignments: ActiveProjectAssignmentSummary[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type EmployeeListFilters = {
  roleId?: string;
  roleKey?: string;
  status?: EmployeeStatus;
  managerId?: string;
  projectId?: string;
  includeDeleted?: boolean;
};

export function formatEmployeeName(
  firstName: string,
  lastName: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}
