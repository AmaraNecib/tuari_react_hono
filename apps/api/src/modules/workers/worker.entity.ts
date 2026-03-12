import type { ProjectReference } from "../projects/project.entity";

export const workerRoles = [
  "WORKER",
  "PROJECT_MANAGER",
  "WAREHOUSE_MANAGER",
] as const;

export const workerStatuses = [
  "ACTIVE",
  "INACTIVE",
  "ON_LEAVE",
] as const;

export type WorkerRole = (typeof workerRoles)[number];
export type WorkerStatus = (typeof workerStatuses)[number];

export type WorkerReference = {
  id: string;
  fullName: string;
  role: WorkerRole;
};

export type Worker = {
  id: string;
  fullName: string;
  phoneNumber: string;
  role: WorkerRole;
  status: WorkerStatus;
  salaryDzd: number;
  managerId: string | null;
  currentProjectId: string | null;
  manager: WorkerReference | null;
  currentProject: ProjectReference | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type WorkerListFilters = {
  role?: WorkerRole;
  status?: WorkerStatus;
  managerId?: string;
  currentProjectId?: string;
  includeDeleted?: boolean;
};
