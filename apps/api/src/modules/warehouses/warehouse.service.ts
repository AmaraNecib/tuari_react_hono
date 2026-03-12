import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { recordAuditLog } from "../audit/audit-log.helpers";
import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { getEmployeeRolePolicy } from "../employees/employee-role-policy";
import { PrismaEmployeeRepository } from "../employees/prisma-employee.repository";
import { AppError } from "../shared/app-error";
import type { Warehouse, WarehouseListFilters, WarehouseStatus } from "./warehouse.entity";
import { PrismaWarehouseRepository } from "./prisma-warehouse.repository";

type CreateWarehouseInput = {
  name: string;
  address?: string | null;
  managerId?: string | null;
  status?: WarehouseStatus;
  notes?: string | null;
};

type UpdateWarehouseInput = {
  id: string;
  name?: string;
  address?: string | null;
  managerId?: string | null;
  status?: WarehouseStatus;
  notes?: string | null;
};

const normalizeText = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

const toWarehouseSnapshot = (warehouse: Warehouse) => ({
  id: warehouse.id,
  name: warehouse.name,
  address: warehouse.address,
  managerId: warehouse.managerId,
  status: warehouse.status,
  notes: warehouse.notes,
  deletedAt: warehouse.deletedAt,
});

export class WarehouseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly warehouses: PrismaWarehouseRepository,
    private readonly employees: PrismaEmployeeRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  list(filters?: WarehouseListFilters): Promise<Warehouse[]> {
    return this.warehouses.list(filters);
  }

  async getById(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouses.getById(id);

    if (!warehouse) {
      throw new AppError("NOT_FOUND", "Warehouse not found.");
    }

    return warehouse;
  }

  async create(input: CreateWarehouseInput, actorUserId: string | null): Promise<Warehouse> {
    return this.prisma.$transaction(async (tx) => {
      const warehouses = this.warehouses.withClient(tx);
      const employees = this.employees.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertWarehouseManager(employees, input.managerId);
      }

      const warehouse = await warehouses.create({
        id: randomUUID(),
        name: input.name.trim(),
        address: normalizeText(input.address) ?? null,
        managerId: input.managerId ?? null,
        status: input.status ?? "ACTIVE",
        notes: normalizeText(input.notes) ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "WAREHOUSE",
        entityId: warehouse.id,
        actionType: "CREATED",
        summaryKey: "audit.warehouse.created",
        actorUserId,
        after: toWarehouseSnapshot(warehouse),
        occurredAt: now,
      });

      if (warehouse.managerId) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE",
          entityId: warehouse.managerId,
          actionType: "WAREHOUSE_MANAGER_ASSIGNED",
          summaryKey: "audit.employee.warehouse_assigned",
          actorUserId,
          metadata: {
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
          },
          occurredAt: now,
        });
      }

      return warehouse;
    });
  }

  async update(input: UpdateWarehouseInput, actorUserId: string | null): Promise<Warehouse> {
    const existing = await this.getById(input.id);

    if (
      input.name === undefined &&
      input.address === undefined &&
      input.managerId === undefined &&
      input.status === undefined &&
      input.notes === undefined
    ) {
      throw new AppError("BAD_REQUEST", "No warehouse fields were provided.");
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouses = this.warehouses.withClient(tx);
      const employees = this.employees.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertWarehouseManager(employees, input.managerId);
      }

      const warehouse = await warehouses.update({
        id: input.id,
        name: input.name?.trim(),
        address: normalizeText(input.address),
        managerId: input.managerId,
        status: input.status,
        notes: normalizeText(input.notes),
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "WAREHOUSE",
        entityId: warehouse.id,
        actionType:
          input.managerId !== undefined && input.managerId !== existing.managerId
            ? "WAREHOUSE_MANAGER_REASSIGNED"
            : input.status !== undefined && input.status !== existing.status
              ? "STATUS_CHANGED"
              : "UPDATED",
        summaryKey:
          input.managerId !== undefined && input.managerId !== existing.managerId
            ? "audit.warehouse.manager_reassigned"
            : input.status !== undefined && input.status !== existing.status
              ? "audit.warehouse.status_changed"
              : "audit.warehouse.updated",
        actorUserId,
        before: toWarehouseSnapshot(existing),
        after: toWarehouseSnapshot(warehouse),
        occurredAt: now,
      });

      if (input.managerId !== undefined && input.managerId !== existing.managerId) {
        if (existing.managerId) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE",
            entityId: existing.managerId,
            actionType: "WAREHOUSE_MANAGER_UNASSIGNED",
            summaryKey: "audit.employee.warehouse_removed",
            actorUserId,
            metadata: {
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
            },
            occurredAt: now,
          });
        }

        if (warehouse.managerId) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE",
            entityId: warehouse.managerId,
            actionType:
              existing.managerId && existing.managerId !== warehouse.managerId
                ? "WAREHOUSE_MANAGER_REASSIGNED"
                : "WAREHOUSE_MANAGER_ASSIGNED",
            summaryKey:
              existing.managerId && existing.managerId !== warehouse.managerId
                ? "audit.employee.warehouse_reassigned"
                : "audit.employee.warehouse_assigned",
            actorUserId,
            metadata: {
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
              previousManagerId: existing.managerId,
            },
            occurredAt: now,
          });
        }
      }

      return warehouse;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const warehouse = await this.getById(id);

    return this.prisma.$transaction(async (tx) => {
      const warehouses = this.warehouses.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const deleted = await warehouses.softDelete(id, now, now);

      if (deleted) {
        await recordAuditLog(audits, {
          entityType: "WAREHOUSE",
          entityId: warehouse.id,
          actionType: "SOFT_DELETED",
          summaryKey: "audit.warehouse.soft_deleted",
          actorUserId,
          before: toWarehouseSnapshot(warehouse),
          after: {
            ...toWarehouseSnapshot(warehouse),
            deletedAt: now.toISOString(),
          },
          occurredAt: now,
        });

        if (warehouse.managerId) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE",
            entityId: warehouse.managerId,
            actionType: "WAREHOUSE_MANAGER_UNASSIGNED",
            summaryKey: "audit.employee.warehouse_removed",
            actorUserId,
            metadata: {
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
            },
            occurredAt: now,
          });
        }
      }

      return deleted;
    });
  }

  private async assertWarehouseManager(
    employees: PrismaEmployeeRepository,
    managerId: string,
  ): Promise<void> {
    const manager = await employees.getById(managerId);

    if (!manager) {
      throw new AppError("NOT_FOUND", "Warehouse manager not found.");
    }

    const policy = getEmployeeRolePolicy(manager.role.key);

    if (!policy.canManageWarehouses) {
      throw new AppError("BAD_REQUEST", "Selected employee cannot manage warehouses.");
    }

    if (manager.status !== "ACTIVE") {
      throw new AppError("BAD_REQUEST", "Warehouse manager must be active.");
    }
  }
}
