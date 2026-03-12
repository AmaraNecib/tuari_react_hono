import type { EmployeeReference } from "../employees/employee.entity";

export const warehouseStatuses = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
] as const;

export type WarehouseStatus = (typeof warehouseStatuses)[number];

export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  managerId: string | null;
  manager: EmployeeReference | null;
  status: WarehouseStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type WarehouseListFilters = {
  managerId?: string;
  status?: WarehouseStatus;
  includeDeleted?: boolean;
};
