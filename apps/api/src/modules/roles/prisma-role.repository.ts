import type { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import type { Role, RoleListFilters } from "./role.entity";
import type {
  RoleLookupOptions,
  RoleRepository,
  RoleUpdateInput,
  RoleWriteInput,
} from "./role.repository";

const toRole = (row: Prisma.RoleGetPayload<Record<string, never>>): Role => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  isSystem: row.isSystem,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaRoleRepository {
    return new PrismaRoleRepository(db);
  }

  async list(filters?: RoleListFilters): Promise<Role[]> {
    const rows = await this.db.role.findMany({
      where: {
        key: filters?.key,
        isSystem: filters?.isSystem,
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [
        { isSystem: "desc" },
        { name: "asc" },
      ],
    });

    return rows.map(toRole);
  }

  async getById(id: string, options?: RoleLookupOptions): Promise<Role | null> {
    const row = await this.db.role.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
    });

    return row ? toRole(row) : null;
  }

  async getByKey(key: string, options?: RoleLookupOptions): Promise<Role | null> {
    const row = await this.db.role.findFirst({
      where: {
        key,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
    });

    return row ? toRole(row) : null;
  }

  async create(input: RoleWriteInput): Promise<Role> {
    const row = await this.db.role.create({
      data: {
        id: input.id,
        key: input.key,
        name: input.name,
        description: input.description,
        isSystem: input.isSystem,
        deletedAt: input.deletedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });

    return toRole(row);
  }

  async update(input: RoleUpdateInput): Promise<Role> {
    const row = await this.db.role.update({
      where: {
        id: input.id,
      },
      data: {
        ...(input.key === undefined ? {} : { key: input.key }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.deletedAt === undefined ? {} : { deletedAt: input.deletedAt }),
        updatedAt: input.updatedAt,
      },
    });

    return toRole(row);
  }

  async softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean> {
    const result = await this.db.role.updateMany({
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
}
