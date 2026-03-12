import type { Project, ProjectListFilters } from "./project.entity";

export type ProjectWriteInput = {
  id: string;
  name: string;
  managerId: string;
  warehouseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ProjectUpdateInput = {
  id: string;
  name?: string;
  managerId?: string;
  warehouseId?: string | null;
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
  countByWarehouseId(warehouseId: string): Promise<number>;
}
