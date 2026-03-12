import type { WarehouseReference } from "../warehouses/warehouse.entity";
import type { WorkerReference } from "../workers/worker.entity";

export type ProjectReference = {
  id: string;
  name: string;
};

export type Project = {
  id: string;
  name: string;
  managerId: string;
  warehouseId: string | null;
  manager: WorkerReference;
  warehouse: WarehouseReference | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ProjectListFilters = {
  managerId?: string;
  warehouseId?: string;
  includeDeleted?: boolean;
};
