import type { Role, RoleListFilters } from "./role.entity";

export type RoleWriteInput = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type RoleUpdateInput = {
  id: string;
  key?: string;
  name?: string;
  description?: string | null;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type RoleLookupOptions = {
  includeDeleted?: boolean;
};

export interface RoleRepository {
  list(filters?: RoleListFilters): Promise<Role[]>;
  getById(id: string, options?: RoleLookupOptions): Promise<Role | null>;
  getByKey(key: string, options?: RoleLookupOptions): Promise<Role | null>;
  create(input: RoleWriteInput): Promise<Role>;
  update(input: RoleUpdateInput): Promise<Role>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
}
