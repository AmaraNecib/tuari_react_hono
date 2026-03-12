import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { recordAuditLog } from "../audit/audit-log.helpers";
import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { AppError } from "../shared/app-error";
import type { EmployeeRepository } from "../employees/employee.repository";
import type { Role, RoleListFilters } from "./role.entity";
import { PrismaRoleRepository } from "./prisma-role.repository";
import { systemRoles } from "./system-roles";

type CreateRoleInput = {
  key: string;
  name: string;
  description?: string | null;
  isSystem?: false;
};

type UpdateRoleInput = {
  id: string;
  key?: string;
  name?: string;
  description?: string | null;
};

const normalizeRoleKey = (value: string) => value.trim().toLowerCase();
const normalizeText = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

const toRoleSnapshot = (role: Role) => ({
  id: role.id,
  key: role.key,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  deletedAt: role.deletedAt,
});

const systemRoleKeys = new Set<string>(systemRoles.map((role) => role.key));

export class RoleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly roles: PrismaRoleRepository,
    private readonly employees: EmployeeRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  list(filters?: RoleListFilters): Promise<Role[]> {
    return this.roles.list(filters);
  }

  async getById(id: string): Promise<Role> {
    const role = await this.roles.getById(id);

    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found.");
    }

    return role;
  }

  async create(input: CreateRoleInput, actorUserId: string | null): Promise<Role> {
    if (input.isSystem) {
      throw new AppError("BAD_REQUEST", "System roles are provisioned by the application.");
    }

    const key = normalizeRoleKey(input.key);
    const name = input.name.trim();
    const description = normalizeText(input.description) ?? null;

    if (systemRoleKeys.has(key)) {
      throw new AppError("CONFLICT", "This role key is reserved for a system role.");
    }

    const existing = await this.roles.getByKey(key, { includeDeleted: true });
    const now = new Date();

    if (existing && !existing.deletedAt) {
      throw new AppError("CONFLICT", "Role key already exists.");
    }

    return this.prisma.$transaction(async (tx) => {
      const roles = this.roles.withClient(tx);
      const audits = this.audits.withClient(tx);

      if (existing?.deletedAt) {
        const restored = await roles.update({
          id: existing.id,
          key,
          name,
          description,
          deletedAt: null,
          updatedAt: now,
        });

        await recordAuditLog(audits, {
          entityType: "ROLE",
          entityId: restored.id,
          actionType: "UPDATED",
          summaryKey: "audit.role.restored",
          actorUserId,
          before: toRoleSnapshot(existing),
          after: toRoleSnapshot(restored),
          occurredAt: now,
        });

        return restored;
      }

      const role = await roles.create({
        id: randomUUID(),
        key,
        name,
        description,
        isSystem: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "ROLE",
        entityId: role.id,
        actionType: "CREATED",
        summaryKey: "audit.role.created",
        actorUserId,
        after: toRoleSnapshot(role),
        occurredAt: now,
      });

      return role;
    });
  }

  async update(input: UpdateRoleInput, actorUserId: string | null): Promise<Role> {
    const existing = await this.getById(input.id);

    if (
      input.key === undefined &&
      input.name === undefined &&
      input.description === undefined
    ) {
      throw new AppError("BAD_REQUEST", "No role fields were provided.");
    }

    const key = input.key ? normalizeRoleKey(input.key) : undefined;
    const name = input.name?.trim();
    const description = normalizeText(input.description);

    if (existing.isSystem && key && key !== existing.key) {
      throw new AppError("CONFLICT", "System role keys cannot be changed.");
    }

    if (key && key !== existing.key) {
      if (systemRoleKeys.has(key)) {
        throw new AppError("CONFLICT", "This role key is reserved for a system role.");
      }

      const duplicate = await this.roles.getByKey(key, { includeDeleted: true });

      if (duplicate && duplicate.id !== existing.id) {
        throw new AppError("CONFLICT", "Role key already exists.");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const roles = this.roles.withClient(tx);
      const audits = this.audits.withClient(tx);
      const role = await roles.update({
        id: input.id,
        key,
        name,
        description,
        updatedAt: new Date(),
      });

      await recordAuditLog(audits, {
        entityType: "ROLE",
        entityId: role.id,
        actionType: "UPDATED",
        summaryKey: "audit.role.updated",
        actorUserId,
        before: toRoleSnapshot(existing),
        after: toRoleSnapshot(role),
      });

      return role;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const role = await this.getById(id);

    if (role.isSystem) {
      throw new AppError("CONFLICT", "System roles cannot be deleted.");
    }

    const employeeCount = await this.employees.countByRoleId(role.id);

    if (employeeCount > 0) {
      throw new AppError("CONFLICT", "Role cannot be deleted while employees still use it.");
    }

    return this.prisma.$transaction(async (tx) => {
      const roles = this.roles.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const deleted = await roles.softDelete(id, now, now);

      if (deleted) {
        await recordAuditLog(audits, {
          entityType: "ROLE",
          entityId: role.id,
          actionType: "SOFT_DELETED",
          summaryKey: "audit.role.soft_deleted",
          actorUserId,
          before: toRoleSnapshot(role),
          after: {
            ...toRoleSnapshot(role),
            deletedAt: now.toISOString(),
          },
          occurredAt: now,
        });
      }

      return deleted;
    });
  }
}
