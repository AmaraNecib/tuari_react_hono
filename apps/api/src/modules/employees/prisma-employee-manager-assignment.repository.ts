import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import {
  formatEmployeeName,
  type EmployeeReference,
  type EmployeeStatus,
} from "./employee.entity";
import type {
  EmployeeManagerAssignment,
  EmployeeManagerAssignmentListFilters,
} from "./employee-manager-assignment.entity";
import type {
  EmployeeManagerAssignmentLookupOptions,
  EmployeeManagerAssignmentRepository,
  EmployeeManagerAssignmentUpdateInput,
  EmployeeManagerAssignmentWriteInput,
} from "./employee-manager-assignment.repository";

const assignmentInclude = {
  worker: {
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
} satisfies Prisma.EmployeeManagerAssignmentInclude;

type AssignmentRow = Prisma.EmployeeManagerAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

const toEmployeeReference = (row: AssignmentRow["worker"]): EmployeeReference => ({
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

const toAssignment = (row: AssignmentRow): EmployeeManagerAssignment => ({
  id: row.id,
  workerId: row.workerId,
  managerId: row.managerId,
  status: row.status as EmployeeManagerAssignment["status"],
  startDate: row.startDate.toISOString(),
  endDate: row.endDate?.toISOString() ?? null,
  notes: row.notes,
  worker: toEmployeeReference(row.worker),
  manager: toEmployeeReference(row.manager),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaEmployeeManagerAssignmentRepository
  implements EmployeeManagerAssignmentRepository
{
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaEmployeeManagerAssignmentRepository {
    return new PrismaEmployeeManagerAssignmentRepository(db);
  }

  async list(
    filters?: EmployeeManagerAssignmentListFilters,
  ): Promise<EmployeeManagerAssignment[]> {
    const rows = await this.db.employeeManagerAssignment.findMany({
      where: {
        workerId: filters?.workerId,
        managerId: filters?.managerId,
        status: filters?.status,
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: assignmentInclude,
      orderBy: [
        { startDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map(toAssignment);
  }

  async getById(
    id: string,
    options?: EmployeeManagerAssignmentLookupOptions,
  ): Promise<EmployeeManagerAssignment | null> {
    const row = await this.db.employeeManagerAssignment.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: assignmentInclude,
    });

    return row ? toAssignment(row) : null;
  }

  async getActiveByWorkerId(workerId: string): Promise<EmployeeManagerAssignment | null> {
    const row = await this.db.employeeManagerAssignment.findFirst({
      where: {
        workerId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: assignmentInclude,
      orderBy: {
        startDate: "desc",
      },
    });

    return row ? toAssignment(row) : null;
  }

  countActiveByManagerId(managerId: string): Promise<number> {
    return this.db.employeeManagerAssignment.count({
      where: {
        managerId,
        status: "ACTIVE",
        deletedAt: null,
      },
    });
  }

  async create(
    input: EmployeeManagerAssignmentWriteInput,
  ): Promise<EmployeeManagerAssignment> {
    const row = await this.db.employeeManagerAssignment.create({
      data: {
        id: input.id,
        workerId: input.workerId,
        managerId: input.managerId,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes,
        deletedAt: input.deletedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
      include: assignmentInclude,
    });

    return toAssignment(row);
  }

  async update(
    input: EmployeeManagerAssignmentUpdateInput,
  ): Promise<EmployeeManagerAssignment> {
    const row = await this.db.employeeManagerAssignment.update({
      where: {
        id: input.id,
      },
      data: {
        ...(input.managerId === undefined ? {} : { managerId: input.managerId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
        ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        updatedAt: input.updatedAt,
      },
      include: assignmentInclude,
    });

    return toAssignment(row);
  }

  async softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean> {
    const result = await this.db.employeeManagerAssignment.updateMany({
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

  async endActiveByWorkerId(
    workerId: string,
    endDate: Date,
    updatedAt: Date,
  ): Promise<number> {
    const result = await this.db.employeeManagerAssignment.updateMany({
      where: {
        workerId,
        status: "ACTIVE",
        deletedAt: null,
      },
      data: {
        status: "ENDED",
        endDate,
        updatedAt,
      },
    });

    return result.count;
  }
}
