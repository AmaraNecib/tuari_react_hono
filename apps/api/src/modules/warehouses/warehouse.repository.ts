import type { Warehouse, WarehouseListFilters, WarehouseStatus } from "./warehouse.entity";

export type WarehouseWriteInput = {
  id: string;
  name: string;
  address: string | null;
  managerId: string | null;
  status: WarehouseStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type WarehouseUpdateInput = {
  id: string;
  name?: string;
  address?: string | null;
  managerId?: string | null;
  status?: WarehouseStatus;
  notes?: string | null;
  updatedAt: Date;
};

export type WarehouseLookupOptions = {
  includeDeleted?: boolean;
};

export interface WarehouseRepository {
  list(filters?: WarehouseListFilters): Promise<Warehouse[]>;
  getById(id: string, options?: WarehouseLookupOptions): Promise<Warehouse | null>;
  create(input: WarehouseWriteInput): Promise<Warehouse>;
  update(input: WarehouseUpdateInput): Promise<Warehouse>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
  countByManagerId(managerId: string): Promise<number>;
}
