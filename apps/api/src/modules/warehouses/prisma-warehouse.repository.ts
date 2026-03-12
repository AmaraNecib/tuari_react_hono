import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import type { WorkerReference, WorkerRole } from "../workers/worker.entity";
import type { Warehouse, WarehouseListFilters } from "./warehouse.entity";
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
      fullName: true,
      role: true,
    },
  },
} satisfies Prisma.WarehouseInclude;

type WarehouseRow = Prisma.WarehouseGetPayload<{
  include: typeof warehouseInclude;
}>;

const toWorkerReference = (row: {
  id: string;
  fullName: string;
  role: string;
}): WorkerReference => ({
  id: row.id,
  fullName: row.fullName,
  role: row.role as WorkerRole,
});

const toWarehouse = (row: WarehouseRow): Warehouse => ({
  id: row.id,
  name: row.name,
  managerId: row.managerId,
  manager: row.manager ? toWorkerReference(row.manager) : null,
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
        managerId: input.managerId,
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
      where: { id: input.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.managerId === undefined ? {} : { managerId: input.managerId }),
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
