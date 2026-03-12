import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import type {
  Worker,
  WorkerListFilters,
  WorkerReference,
  WorkerRole,
  WorkerStatus,
} from "./worker.entity";
import type {
  WorkerAssignmentUpdateInput,
  WorkerDetailsUpdateInput,
  WorkerLookupOptions,
  WorkerRepository,
  WorkerSalaryUpdateInput,
  WorkerStatusUpdateInput,
  WorkerWriteInput,
} from "./worker.repository";

const workerInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      role: true,
    },
  },
  currentProject: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.WorkerInclude;

type WorkerRow = Prisma.WorkerGetPayload<{
  include: typeof workerInclude;
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

const toWorker = (row: WorkerRow): Worker => ({
  id: row.id,
  fullName: row.fullName,
  phoneNumber: row.phoneNumber,
  role: row.role as WorkerRole,
  status: row.status as WorkerStatus,
  salaryDzd: row.salaryDzd,
  managerId: row.managerId,
  currentProjectId: row.currentProjectId,
  manager: row.manager ? toWorkerReference(row.manager) : null,
  currentProject: row.currentProject
    ? {
        id: row.currentProject.id,
        name: row.currentProject.name,
      }
    : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaWorkerRepository implements WorkerRepository {
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaWorkerRepository {
    return new PrismaWorkerRepository(db);
  }

  async list(filters?: WorkerListFilters): Promise<Worker[]> {
    const rows = await this.db.worker.findMany({
      where: {
        role: filters?.role,
        status: filters?.status,
        managerId: filters?.managerId,
        currentProjectId: filters?.currentProjectId,
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: workerInclude,
      orderBy: [
        { deletedAt: "asc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map(toWorker);
  }

  async getById(id: string, options?: WorkerLookupOptions): Promise<Worker | null> {
    const row = await this.db.worker.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: workerInclude,
    });

    return row ? toWorker(row) : null;
  }

  async create(input: WorkerWriteInput): Promise<Worker> {
    const row = await this.db.worker.create({
      data: {
        id: input.id,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        role: input.role,
        status: input.status,
        salaryDzd: input.salaryDzd,
        managerId: input.managerId,
        currentProjectId: input.currentProjectId,
        deletedAt: input.deletedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
      include: workerInclude,
    });

    return toWorker(row);
  }

  async updateDetails(input: WorkerDetailsUpdateInput): Promise<Worker> {
    const row = await this.db.worker.update({
      where: { id: input.id },
      data: {
        ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
        ...(input.phoneNumber === undefined
          ? {}
          : { phoneNumber: input.phoneNumber }),
        updatedAt: input.updatedAt,
      },
      include: workerInclude,
    });

    return toWorker(row);
  }

  async updateAssignment(input: WorkerAssignmentUpdateInput): Promise<Worker> {
    const row = await this.db.worker.update({
      where: { id: input.id },
      data: {
        managerId: input.managerId,
        currentProjectId: input.currentProjectId,
        updatedAt: input.updatedAt,
      },
      include: workerInclude,
    });

    return toWorker(row);
  }

  async updateStatus(input: WorkerStatusUpdateInput): Promise<Worker> {
    const row = await this.db.worker.update({
      where: { id: input.id },
      data: {
        status: input.status,
        updatedAt: input.updatedAt,
      },
      include: workerInclude,
    });

    return toWorker(row);
  }

  async updateSalary(input: WorkerSalaryUpdateInput): Promise<Worker> {
    const row = await this.db.worker.update({
      where: { id: input.id },
      data: {
        salaryDzd: input.salaryDzd,
        updatedAt: input.updatedAt,
      },
      include: workerInclude,
    });

    return toWorker(row);
  }

  async softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean> {
    const result = await this.db.worker.updateMany({
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
    return this.db.worker.count({
      where: {
        managerId,
        deletedAt: null,
      },
    });
  }

  countByCurrentProjectId(projectId: string): Promise<number> {
    return this.db.worker.count({
      where: {
        currentProjectId: projectId,
        deletedAt: null,
      },
    });
  }
}
