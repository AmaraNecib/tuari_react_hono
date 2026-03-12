import type { Prisma } from "@prisma/client";

import type { EmployeeReference, EmployeeStatus } from "../employees/employee.entity";
import { formatEmployeeName } from "../employees/employee.entity";
import type { DatabaseClient } from "../shared/database-client";
import type { Warehouse, WarehouseListFilters, WarehouseStatus } from "./warehouse.entity";
import type {
  WarehouseLookupOptions,
  WarehouseRepository,
  WarehouseUpdateInput,
  WarehouseWriteInput,
} from "./warehouse.repository";

const warehouseInclude = {
  manager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      role: {
        select: {
          id: true,
          key: true,
          name: true,
          isSystem: true,
        },
      },
    },
  },
} satisfies Prisma.WarehouseInclude;

type WarehouseRow = Prisma.WarehouseGetPayload<{
  include: typeof warehouseInclude;
}>;

const toEmployeeReference = (
  row: NonNullable<WarehouseRow["manager"]>,
): EmployeeReference => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  displayName: formatEmployeeName(row.firstName, row.lastName),
  status: row.status as EmployeeStatus,
  role: {
    id: row.role.id,
    key: row.role.key,
    name: row.role.name,
    isSystem: row.role.isSystem,
  },
});

const toWarehouse = (row: WarehouseRow): Warehouse => ({
  id: row.id,
  name: row.name,
  address: row.address,
  managerId: row.managerId,
  manager: row.manager ? toEmployeeReference(row.manager) : null,
  status: row.status as WarehouseStatus,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaWarehouseRepository {
    return new PrismaWarehouseRepository(db);
  }

  async list(filters?: WarehouseListFilters): Promise<Warehouse[]> {
    const rows = await this.db.warehouse.findMany({
      where: {
        managerId: filters?.managerId,
        status: filters?.status,
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: warehouseInclude,
      orderBy: [
        { deletedAt: "asc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map(toWarehouse);
  }

  async getById(
    id: string,
    options?: WarehouseLookupOptions,
  ): Promise<Warehouse | null> {
    const row = await this.db.warehouse.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: warehouseInclude,
    });

    return row ? toWarehouse(row) : null;
  }

  async create(input: WarehouseWriteInput): Promise<Warehouse> {
    const row = await this.db.warehouse.create({
      data: {
        id: input.id,
        name: input.name,
        address: input.address,
        managerId: input.managerId,
        status: input.status,
        notes: input.notes,
        deletedAt: input.deletedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
      include: warehouseInclude,
    });

    return toWarehouse(row);
  }

  async update(input: WarehouseUpdateInput): Promise<Warehouse> {
    const row = await this.db.warehouse.update({
      where: {
        id: input.id,
      },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.managerId === undefined ? {} : { managerId: input.managerId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        updatedAt: input.updatedAt,
      },
      include: warehouseInclude,
    });

    return toWarehouse(row);
  }

  async softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean> {
    const result = await this.db.warehouse.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt,
        updatedAt,
      },
    });

    return result.count > 0;
  }

  countByManagerId(managerId: string): Promise<number> {
    return this.db.warehouse.count({
      where: {
        managerId,
        deletedAt: null,
      },
    });
  }
}
