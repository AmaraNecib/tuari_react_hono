import type {
  Worker,
  WorkerListFilters,
  WorkerRole,
  WorkerStatus,
} from "./worker.entity";

export type WorkerWriteInput = {
  id: string;
  fullName: string;
  phoneNumber: string;
  role: WorkerRole;
  status: WorkerStatus;
  salaryDzd: number;
  managerId: string | null;
  currentProjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type WorkerDetailsUpdateInput = {
  id: string;
  fullName?: string;
  phoneNumber?: string;
  updatedAt: Date;
};

export type WorkerAssignmentUpdateInput = {
  id: string;
  managerId: string;
  currentProjectId: string;
  updatedAt: Date;
};

export type WorkerStatusUpdateInput = {
  id: string;
  status: WorkerStatus;
  updatedAt: Date;
};

export type WorkerSalaryUpdateInput = {
  id: string;
  salaryDzd: number;
  updatedAt: Date;
};

export type WorkerLookupOptions = {
  includeDeleted?: boolean;
};

export interface WorkerRepository {
  list(filters?: WorkerListFilters): Promise<Worker[]>;
  getById(id: string, options?: WorkerLookupOptions): Promise<Worker | null>;
  create(input: WorkerWriteInput): Promise<Worker>;
  updateDetails(input: WorkerDetailsUpdateInput): Promise<Worker>;
  updateAssignment(input: WorkerAssignmentUpdateInput): Promise<Worker>;
  updateStatus(input: WorkerStatusUpdateInput): Promise<Worker>;
  updateSalary(input: WorkerSalaryUpdateInput): Promise<Worker>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
  countByManagerId(managerId: string): Promise<number>;
  countByCurrentProjectId(projectId: string): Promise<number>;
}
