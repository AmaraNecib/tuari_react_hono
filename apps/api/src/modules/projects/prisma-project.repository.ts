import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import type { WorkerReference, WorkerRole } from "../workers/worker.entity";
import type { Project, ProjectListFilters } from "./project.entity";
import type {
  ProjectLookupOptions,
  ProjectRepository,
  ProjectUpdateInput,
  ProjectWriteInput,
} from "./project.repository";

const projectInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      role: true,
    },
  },
  warehouse: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
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

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  managerId: row.managerId,
  warehouseId: row.warehouseId,
  manager: toWorkerReference(row.manager),
  warehouse: row.warehouse
    ? {
        id: row.warehouse.id,
        name: row.warehouse.name,
      }
    : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaProjectRepository {
    return new PrismaProjectRepository(db);
  }

  async list(filters?: ProjectListFilters): Promise<Project[]> {
    const rows = await this.db.project.findMany({
      where: {
        managerId: filters?.managerId,
        warehouseId: filters?.warehouseId,
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: projectInclude,
      orderBy: [
        { deletedAt: "asc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map(toProject);
  }

  async getById(id: string, options?: ProjectLookupOptions): Promise<Project | null> {
    const row = await this.db.project.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: projectInclude,
    });

    return row ? toProject(row) : null;
  }

  async create(input: ProjectWriteInput): Promise<Project> {
    const row = await this.db.project.create({
      data: {
        id: input.id,
        name: input.name,
        managerId: input.managerId,
        warehouseId: input.warehouseId,
        deletedAt: input.deletedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
      include: projectInclude,
    });

    return toProject(row);
  }

  async update(input: ProjectUpdateInput): Promise<Project> {
    const row = await this.db.project.update({
      where: { id: input.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.managerId === undefined ? {} : { managerId: input.managerId }),
        ...(input.warehouseId === undefined
          ? {}
          : { warehouseId: input.warehouseId }),
        updatedAt: input.updatedAt,
      },
      include: projectInclude,
    });

    return toProject(row);
  }

  async softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean> {
    const result = await this.db.project.updateMany({
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
    return this.db.project.count({
      where: {
        managerId,
        deletedAt: null,
      },
    });
  }

  countByWarehouseId(warehouseId: string): Promise<number> {
    return this.db.project.count({
      where: {
        warehouseId,
        deletedAt: null,
      },
    });
  }
}
