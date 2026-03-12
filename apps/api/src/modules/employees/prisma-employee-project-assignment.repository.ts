import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import {
  formatEmployeeName,
  type EmployeeReference,
  type EmployeeStatus,
  type ProjectReference,
} from "./employee.entity";
import type { ProjectStatus } from "../projects/project.entity";
import type {
  EmployeeProjectAssignment,
  EmployeeProjectAssignmentListFilters,
} from "./employee-project-assignment.entity";
import type {
  EmployeeProjectAssignmentLookupOptions,
  EmployeeProjectAssignmentRepository,
  EmployeeProjectAssignmentUpdateInput,
  EmployeeProjectAssignmentWriteInput,
} from "./employee-project-assignment.repository";

const assignmentInclude = {
  employee: {
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
  project: {
    select: {
      id: true,
      name: true,
      status: true,
      managerId: true,
    },
  },
} satisfies Prisma.EmployeeProjectAssignmentInclude;

type AssignmentRow = Prisma.EmployeeProjectAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

const toEmployeeReference = (row: AssignmentRow["employee"]): EmployeeReference => ({
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

const toProjectReference = (row: AssignmentRow["project"]): ProjectReference => ({
  id: row.id,
  name: row.name,
  status: row.status as ProjectStatus,
  managerId: row.managerId,
});

const toAssignment = (row: AssignmentRow): EmployeeProjectAssignment => ({
  id: row.id,
  employeeId: row.employeeId,
  projectId: row.projectId,
  status: row.status as EmployeeProjectAssignment["status"],
  startDate: row.startDate.toISOString(),
  endDate: row.endDate?.toISOString() ?? null,
  notes: row.notes,
  employee: toEmployeeReference(row.employee),
  project: toProjectReference(row.project),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaEmployeeProjectAssignmentRepository
  implements EmployeeProjectAssignmentRepository
{
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaEmployeeProjectAssignmentRepository {
    return new PrismaEmployeeProjectAssignmentRepository(db);
  }

  async list(
    filters?: EmployeeProjectAssignmentListFilters,
  ): Promise<EmployeeProjectAssignment[]> {
    const rows = await this.db.employeeProjectAssignment.findMany({
      where: {
        employeeId: filters?.employeeId,
        projectId: filters?.projectId,
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
    options?: EmployeeProjectAssignmentLookupOptions,
  ): Promise<EmployeeProjectAssignment | null> {
    const row = await this.db.employeeProjectAssignment.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: assignmentInclude,
    });

    return row ? toAssignment(row) : null;
  }

  async listActiveByEmployeeId(employeeId: string): Promise<EmployeeProjectAssignment[]> {
    const rows = await this.db.employeeProjectAssignment.findMany({
      where: {
        employeeId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: assignmentInclude,
      orderBy: {
        startDate: "desc",
      },
    });

    return rows.map(toAssignment);
  }

  async getActiveByEmployeeAndProject(
    employeeId: string,
    projectId: string,
  ): Promise<EmployeeProjectAssignment | null> {
    const row = await this.db.employeeProjectAssignment.findFirst({
      where: {
        employeeId,
        projectId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: assignmentInclude,
    });

    return row ? toAssignment(row) : null;
  }

  countActiveByProjectId(projectId: string): Promise<number> {
    return this.db.employeeProjectAssignment.count({
      where: {
        projectId,
        status: "ACTIVE",
        deletedAt: null,
      },
    });
  }

  async create(
    input: EmployeeProjectAssignmentWriteInput,
  ): Promise<EmployeeProjectAssignment> {
    const row = await this.db.employeeProjectAssignment.create({
      data: {
        id: input.id,
        employeeId: input.employeeId,
        projectId: input.projectId,
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
    input: EmployeeProjectAssignmentUpdateInput,
  ): Promise<EmployeeProjectAssignment> {
    const row = await this.db.employeeProjectAssignment.update({
      where: {
        id: input.id,
      },
      data: {
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
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
    const result = await this.db.employeeProjectAssignment.updateMany({
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

  async endActiveByEmployeeId(
    employeeId: string,
    endDate: Date,
    updatedAt: Date,
  ): Promise<number> {
    const result = await this.db.employeeProjectAssignment.updateMany({
      where: {
        employeeId,
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
