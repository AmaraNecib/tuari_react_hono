import type { WorkerReference } from "../workers/worker.entity";

export type WarehouseReference = {
  id: string;
  name: string;
};

export type Warehouse = {
  id: string;
  name: string;
  managerId: string | null;
  manager: WorkerReference | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type WarehouseListFilters = {
  managerId?: string;
  includeDeleted?: boolean;
};
