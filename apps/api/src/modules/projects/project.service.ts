import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { AppError } from "../shared/app-error";
import { PrismaWorkerRepository } from "../workers/prisma-worker.repository";
import type { Project, ProjectListFilters } from "./project.entity";
import { PrismaProjectRepository } from "./prisma-project.repository";

type CreateProjectInput = {
  name: string;
  managerId: string;
  warehouseId?: string | null;
};

type UpdateProjectInput = {
  id: string;
  name?: string;
  managerId?: string;
  warehouseId?: string | null;
};

const toProjectSnapshot = (project: Project) => ({
  id: project.id,
  name: project.name,
  managerId: project.managerId,
  warehouseId: project.warehouseId,
  deletedAt: project.deletedAt,
});

export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projects: PrismaProjectRepository,
    private readonly workers: PrismaWorkerRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  list(filters?: ProjectListFilters): Promise<Project[]> {
    return this.projects.list(filters);
  }

  async getById(id: string): Promise<Project> {
    const project = await this.projects.getById(id);

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found.");
    }

    return project;
  }

  async create(input: CreateProjectInput, actorUserId: string | null): Promise<Project> {
    return this.prisma.$transaction(async (tx) => {
      const projects = this.projects.withClient(tx);
      const workers = this.workers.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      await this.assertProjectManager(workers, input.managerId);
      await this.assertWarehouseIfProvided(tx, input.warehouseId ?? null);

      const project = await projects.create({
        id: randomUUID(),
        name: input.name,
        managerId: input.managerId,
        warehouseId: input.warehouseId ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await audits.create({
        id: randomUUID(),
        entityType: "PROJECT",
        entityId: project.id,
        actionType: "CREATED",
        summaryKey: "audit.project.created",
        actorUserId,
        occurredAt: now,
        before: null,
        after: toProjectSnapshot(project),
        metadata: null,
        createdAt: now,
      });

      return project;
    });
  }

  async update(input: UpdateProjectInput, actorUserId: string | null): Promise<Project> {
    const existing = await this.getById(input.id);

    if (
      input.name === undefined &&
      input.managerId === undefined &&
      input.warehouseId === undefined
    ) {
      throw new AppError("BAD_REQUEST", "No project fields were provided.");
    }

    if (input.managerId && input.managerId !== existing.managerId) {
      const assignedWorkerCount = await this.workers.countByCurrentProjectId(existing.id);

      if (assignedWorkerCount > 0) {
        throw new AppError(
          "CONFLICT",
          "Cannot change the project manager while workers are assigned to the project.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const projects = this.projects.withClient(tx);
      const workers = this.workers.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertProjectManager(workers, input.managerId);
      }

      await this.assertWarehouseIfProvided(tx, input.warehouseId ?? undefined);

      const project = await projects.update({
        id: input.id,
        name: input.name,
        managerId: input.managerId,
        warehouseId: input.warehouseId,
        updatedAt: now,
      });

      await audits.create({
        id: randomUUID(),
        entityType: "PROJECT",
        entityId: project.id,
        actionType: "UPDATED",
        summaryKey: "audit.project.updated",
        actorUserId,
        occurredAt: now,
        before: toProjectSnapshot(existing),
        after: toProjectSnapshot(project),
        metadata: null,
        createdAt: now,
      });

      return project;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const project = await this.getById(id);
    const assignedWorkerCount = await this.workers.countByCurrentProjectId(id);

    if (assignedWorkerCount > 0) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a project while workers are assigned to it.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const projects = this.projects.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      const deleted = await projects.softDelete(id, now, now);

      if (!deleted) {
        throw new AppError("NOT_FOUND", "Project not found.");
      }

      await audits.create({
        id: randomUUID(),
        entityType: "PROJECT",
        entityId: project.id,
        actionType: "SOFT_DELETED",
        summaryKey: "audit.project.soft_deleted",
        actorUserId,
        occurredAt: now,
        before: toProjectSnapshot(project),
        after: {
          ...toProjectSnapshot(project),
          deletedAt: now.toISOString(),
        },
        metadata: null,
        createdAt: now,
      });

      return true;
    });
  }

  private async assertProjectManager(
    workers: PrismaWorkerRepository,
    managerId: string,
  ): Promise<void> {
    const manager = await workers.getById(managerId);

    if (!manager) {
      throw new AppError("NOT_FOUND", "Project manager not found.");
    }

    if (manager.role !== "PROJECT_MANAGER") {
      throw new AppError("BAD_REQUEST", "Selected worker is not a project manager.");
    }

    if (manager.status !== "ACTIVE") {
      throw new AppError("BAD_REQUEST", "Project manager must be active.");
    }
  }

  private async assertWarehouseIfProvided(
    tx: Prisma.TransactionClient,
    warehouseId: string | null | undefined,
  ): Promise<void> {
    if (warehouseId === undefined || warehouseId === null) {
      return;
    }

    const warehouse = await tx.warehouse.findFirst({
      where: {
        id: warehouseId,
        deletedAt: null,
      },
    });

    if (!warehouse) {
      throw new AppError("NOT_FOUND", "Warehouse not found.");
    }
  }
}
