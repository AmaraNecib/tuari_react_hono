import type { EmployeeReference } from "../employees/employee.entity";

export const projectStatuses = [
  "ACTIVE",
  "STOPPED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export type Project = {
  id: string;
  name: string;
  location: string | null;
  managerId: string | null;
  manager: EmployeeReference | null;
  status: ProjectStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ProjectListFilters = {
  managerId?: string;
  status?: ProjectStatus;
  includeDeleted?: boolean;
};
