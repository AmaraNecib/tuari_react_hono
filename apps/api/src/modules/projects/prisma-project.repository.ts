import type { Prisma } from "@prisma/client";

import type { EmployeeReference, EmployeeStatus } from "../employees/employee.entity";
import { formatEmployeeName } from "../employees/employee.entity";
import type { DatabaseClient } from "../shared/database-client";
import type { Project, ProjectListFilters, ProjectStatus } from "./project.entity";
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
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;

const toEmployeeReference = (row: NonNullable<ProjectRow["manager"]>): EmployeeReference => ({
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

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  location: row.location,
  managerId: row.managerId,
  manager: row.manager ? toEmployeeReference(row.manager) : null,
  status: row.status as ProjectStatus,
  notes: row.notes,
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
        status: filters?.status,
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
        location: input.location,
        managerId: input.managerId,
        status: input.status,
        notes: input.notes,
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
      where: {
        id: input.id,
      },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(input.managerId === undefined ? {} : { managerId: input.managerId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
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
}
