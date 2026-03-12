import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { PrismaProjectRepository } from "../projects/prisma-project.repository";
import { AppError } from "../shared/app-error";
import { PrismaWorkerRepository } from "../workers/prisma-worker.repository";
import type { Warehouse, WarehouseListFilters } from "./warehouse.entity";
import { PrismaWarehouseRepository } from "./prisma-warehouse.repository";

type CreateWarehouseInput = {
  name: string;
  managerId?: string | null;
};

type UpdateWarehouseInput = {
  id: string;
  name?: string;
  managerId?: string | null;
};

const toWarehouseSnapshot = (warehouse: Warehouse) => ({
  id: warehouse.id,
  name: warehouse.name,
  managerId: warehouse.managerId,
  deletedAt: warehouse.deletedAt,
});

export class WarehouseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly warehouses: PrismaWarehouseRepository,
    private readonly workers: PrismaWorkerRepository,
    private readonly projects: PrismaProjectRepository,
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

  async create(
    input: CreateWarehouseInput,
    actorUserId: string | null,
  ): Promise<Warehouse> {
    return this.prisma.$transaction(async (tx) => {
      const warehouses = this.warehouses.withClient(tx);
      const workers = this.workers.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertWarehouseManager(workers, input.managerId);
      }

      const warehouse = await warehouses.create({
        id: randomUUID(),
        name: input.name,
        managerId: input.managerId ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await audits.create({
        id: randomUUID(),
        entityType: "WAREHOUSE",
        entityId: warehouse.id,
        actionType: "CREATED",
        summaryKey: "audit.warehouse.created",
        actorUserId,
        occurredAt: now,
        before: null,
        after: toWarehouseSnapshot(warehouse),
        metadata: null,
        createdAt: now,
      });

      return warehouse;
    });
  }

  async update(
    input: UpdateWarehouseInput,
    actorUserId: string | null,
  ): Promise<Warehouse> {
    const existing = await this.getById(input.id);

    if (input.name === undefined && input.managerId === undefined) {
      throw new AppError("BAD_REQUEST", "No warehouse fields were provided.");
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouses = this.warehouses.withClient(tx);
      const workers = this.workers.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertWarehouseManager(workers, input.managerId);
      }

      const warehouse = await warehouses.update({
        id: input.id,
        name: input.name,
        managerId: input.managerId,
        updatedAt: now,
      });

      await audits.create({
        id: randomUUID(),
        entityType: "WAREHOUSE",
        entityId: warehouse.id,
        actionType: "UPDATED",
        summaryKey: "audit.warehouse.updated",
        actorUserId,
        occurredAt: now,
        before: toWarehouseSnapshot(existing),
        after: toWarehouseSnapshot(warehouse),
        metadata: null,
        createdAt: now,
      });

      return warehouse;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const warehouse = await this.getById(id);
    const projectCount = await this.projects.countByWarehouseId(id);

    if (projectCount > 0) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a warehouse while projects still belong to it.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouses = this.warehouses.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      const deleted = await warehouses.softDelete(id, now, now);

      if (!deleted) {
        throw new AppError("NOT_FOUND", "Warehouse not found.");
      }

      await audits.create({
        id: randomUUID(),
        entityType: "WAREHOUSE",
        entityId: warehouse.id,
        actionType: "SOFT_DELETED",
        summaryKey: "audit.warehouse.soft_deleted",
        actorUserId,
        occurredAt: now,
        before: toWarehouseSnapshot(warehouse),
        after: {
          ...toWarehouseSnapshot(warehouse),
          deletedAt: now.toISOString(),
        },
        metadata: null,
        createdAt: now,
      });

      return true;
    });
  }

  private async assertWarehouseManager(
    workers: PrismaWorkerRepository,
    managerId: string,
  ): Promise<void> {
    const manager = await workers.getById(managerId);

    if (!manager) {
      throw new AppError("NOT_FOUND", "Warehouse manager not found.");
    }

    if (manager.role !== "WAREHOUSE_MANAGER") {
      throw new AppError(
        "BAD_REQUEST",
        "Selected worker is not a warehouse manager.",
      );
    }

    if (manager.status !== "ACTIVE") {
      throw new AppError("BAD_REQUEST", "Warehouse manager must be active.");
    }
  }
}
