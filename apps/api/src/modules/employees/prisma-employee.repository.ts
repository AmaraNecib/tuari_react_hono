import type { Prisma } from "@prisma/client";

import type { RoleReference } from "../roles/role.entity";
import type { DatabaseClient } from "../shared/database-client";
import {
  formatEmployeeName,
  type ActiveManagerAssignmentSummary,
  type ActiveProjectAssignmentSummary,
  type Employee,
  type EmployeeListFilters,
  type EmployeeReference,
  type EmployeeStatus,
  type ProjectReference,
} from "./employee.entity";
import type { AssignmentStatus } from "./employee-manager-assignment.entity";
import type { ProjectStatus } from "../projects/project.entity";
import type {
  EmployeeLookupOptions,
  EmployeeRepository,
  EmployeeUpdateInput,
  EmployeeWriteInput,
} from "./employee.repository";

const activeManagerAssignmentWhere = {
  status: "ACTIVE",
  deletedAt: null,
} satisfies Prisma.EmployeeManagerAssignmentWhereInput;

const employeeInclude = {
  role: {
    select: {
      id: true,
      key: true,
      name: true,
      isSystem: true,
    },
  },
  managerAssignmentsAsWorker: {
    where: activeManagerAssignmentWhere,
    orderBy: {
      startDate: "desc",
    },
    take: 1,
    include: {
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
    },
  },
  projectAssignments: {
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },
    orderBy: [
      { startDate: "desc" },
      { createdAt: "desc" },
    ],
    include: {
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          managerId: true,
        },
      },
    },
  },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{
  include: typeof employeeInclude;
}>;

const toRoleReference = (row: {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}): RoleReference => ({
  id: row.id,
  key: row.key,
  name: row.name,
  isSystem: row.isSystem,
});

const toEmployeeReference = (row: {
  id: string;
  firstName: string;
  lastName: string | null;
  status: string;
  role: {
    id: string;
    key: string;
    name: string;
    isSystem: boolean;
  };
}): EmployeeReference => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  displayName: formatEmployeeName(row.firstName, row.lastName),
  status: row.status as EmployeeStatus,
  role: toRoleReference(row.role),
});

const toProjectReference = (row: {
  id: string;
  name: string;
  status: string;
  managerId: string | null;
}): ProjectReference => ({
  id: row.id,
  name: row.name,
  status: row.status as ProjectStatus,
  managerId: row.managerId,
});

const toActiveManagerAssignment = (
  row: EmployeeRow["managerAssignmentsAsWorker"][number],
): ActiveManagerAssignmentSummary => ({
  id: row.id,
  managerId: row.managerId,
  status: row.status as AssignmentStatus,
  startDate: row.startDate.toISOString(),
  endDate: row.endDate?.toISOString() ?? null,
  notes: row.notes,
  manager: toEmployeeReference(row.manager),
});

const toActiveProjectAssignment = (
  row: EmployeeRow["projectAssignments"][number],
): ActiveProjectAssignmentSummary => ({
  id: row.id,
  projectId: row.projectId,
  status: row.status as AssignmentStatus,
  startDate: row.startDate.toISOString(),
  endDate: row.endDate?.toISOString() ?? null,
  notes: row.notes,
  project: toProjectReference(row.project),
});

const toEmployee = (row: EmployeeRow): Employee => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  displayName: formatEmployeeName(row.firstName, row.lastName),
  phone: row.phone,
  roleId: row.roleId,
  role: toRoleReference(row.role),
  status: row.status as EmployeeStatus,
  notes: row.notes,
  activeManagerAssignment: row.managerAssignmentsAsWorker[0]
    ? toActiveManagerAssignment(row.managerAssignmentsAsWorker[0])
    : null,
  activeProjectAssignments: row.projectAssignments.map(toActiveProjectAssignment),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaEmployeeRepository {
    return new PrismaEmployeeRepository(db);
  }

  async list(filters?: EmployeeListFilters): Promise<Employee[]> {
    const rows = await this.db.employee.findMany({
      where: {
        roleId: filters?.roleId,
        role: filters?.roleKey ? { key: filters.roleKey } : undefined,
        status: filters?.status,
        ...(filters?.managerId
          ? {
              managerAssignmentsAsWorker: {
                some: {
                  managerId: filters.managerId,
                  status: "ACTIVE",
                  deletedAt: null,
                },
              },
            }
          : {}),
        ...(filters?.projectId
          ? {
              projectAssignments: {
                some: {
                  projectId: filters.projectId,
                  status: "ACTIVE",
                  deletedAt: null,
                },
              },
            }
          : {}),
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: employeeInclude,
      orderBy: [
        { deletedAt: "asc" },
        { createdAt: "desc" },
      ],
    });

    return rows.map(toEmployee);
  }

  async getById(id: string, options?: EmployeeLookupOptions): Promise<Employee | null> {
    const row = await this.db.employee.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: employeeInclude,
    });

    return row ? toEmployee(row) : null;
  }

  async create(input: EmployeeWriteInput): Promise<Employee> {
    const row = await this.db.employee.create({
      data: {
        id: input.id,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleId: input.roleId,
        status: input.status,
        notes: input.notes,
        deletedAt: input.deletedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
      include: employeeInclude,
    });

    return toEmployee(row);
  }

  async update(input: EmployeeUpdateInput): Promise<Employee> {
    const row = await this.db.employee.update({
      where: {
        id: input.id,
      },
      data: {
        ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
        ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.roleId === undefined ? {} : { roleId: input.roleId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        updatedAt: input.updatedAt,
      },
      include: employeeInclude,
    });

    return toEmployee(row);
  }

  async softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean> {
    const result = await this.db.employee.updateMany({
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

  countByRoleId(roleId: string): Promise<number> {
    return this.db.employee.count({
      where: {
        roleId,
        deletedAt: null,
      },
    });
  }
}
