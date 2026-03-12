import type { Project, ProjectListFilters, ProjectStatus } from "./project.entity";

export type ProjectWriteInput = {
  id: string;
  name: string;
  location: string | null;
  managerId: string | null;
  status: ProjectStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ProjectUpdateInput = {
  id: string;
  name?: string;
  location?: string | null;
  managerId?: string | null;
  status?: ProjectStatus;
  notes?: string | null;
  updatedAt: Date;
};

export type ProjectLookupOptions = {
  includeDeleted?: boolean;
};

export interface ProjectRepository {
  list(filters?: ProjectListFilters): Promise<Project[]>;
  getById(id: string, options?: ProjectLookupOptions): Promise<Project | null>;
  create(input: ProjectWriteInput): Promise<Project>;
  update(input: ProjectUpdateInput): Promise<Project>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
  countByManagerId(managerId: string): Promise<number>;
}
