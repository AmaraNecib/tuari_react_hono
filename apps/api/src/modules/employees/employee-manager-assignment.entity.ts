import type { EmployeeReference } from "./employee.entity";

export const assignmentStatuses = [
  "ACTIVE",
  "ENDED",
  "CANCELLED",
] as const;

export type AssignmentStatus = (typeof assignmentStatuses)[number];

export type EmployeeManagerAssignment = {
  id: string;
  workerId: string;
  managerId: string;
  status: AssignmentStatus;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  worker: EmployeeReference;
  manager: EmployeeReference;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type EmployeeManagerAssignmentListFilters = {
  workerId?: string;
  managerId?: string;
  status?: AssignmentStatus;
  includeDeleted?: boolean;
};
