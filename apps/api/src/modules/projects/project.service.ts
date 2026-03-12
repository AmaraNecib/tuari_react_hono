import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { recordAuditLog } from "../audit/audit-log.helpers";
import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { getEmployeeRolePolicy } from "../employees/employee-role-policy";
import { PrismaEmployeeProjectAssignmentRepository } from "../employees/prisma-employee-project-assignment.repository";
import { PrismaEmployeeRepository } from "../employees/prisma-employee.repository";
import { AppError } from "../shared/app-error";
import type { Project, ProjectListFilters, ProjectStatus } from "./project.entity";
import { PrismaProjectRepository } from "./prisma-project.repository";

type CreateProjectInput = {
  name: string;
  location?: string | null;
  managerId?: string | null;
  status?: ProjectStatus;
  notes?: string | null;
};

type UpdateProjectInput = {
  id: string;
  name?: string;
  location?: string | null;
  managerId?: string | null;
  status?: ProjectStatus;
  notes?: string | null;
};

const normalizeText = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

const toProjectSnapshot = (project: Project) => ({
  id: project.id,
  name: project.name,
  location: project.location,
  managerId: project.managerId,
  status: project.status,
  notes: project.notes,
  deletedAt: project.deletedAt,
});

export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projects: PrismaProjectRepository,
    private readonly employees: PrismaEmployeeRepository,
    private readonly employeeProjectAssignments: PrismaEmployeeProjectAssignmentRepository,
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
      const employees = this.employees.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertProjectManager(employees, input.managerId);
      }

      const project = await projects.create({
        id: randomUUID(),
        name: input.name.trim(),
        location: normalizeText(input.location) ?? null,
        managerId: input.managerId ?? null,
        status: input.status ?? "ACTIVE",
        notes: normalizeText(input.notes) ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "PROJECT",
        entityId: project.id,
        actionType: "CREATED",
        summaryKey: "audit.project.created",
        actorUserId,
        after: toProjectSnapshot(project),
        occurredAt: now,
      });

      if (project.managerId) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE",
          entityId: project.managerId,
          actionType: "PROJECT_MANAGER_ASSIGNED",
          summaryKey: "audit.employee.project_assigned",
          actorUserId,
          metadata: {
            projectId: project.id,
            projectName: project.name,
          },
          occurredAt: now,
        });
      }

      return project;
    });
  }

  async update(input: UpdateProjectInput, actorUserId: string | null): Promise<Project> {
    const existing = await this.getById(input.id);

    if (
      input.name === undefined &&
      input.location === undefined &&
      input.managerId === undefined &&
      input.status === undefined &&
      input.notes === undefined
    ) {
      throw new AppError("BAD_REQUEST", "No project fields were provided.");
    }

    if (input.managerId !== undefined && input.managerId !== existing.managerId) {
      const activeAssignmentCount =
        await this.employeeProjectAssignments.countActiveByProjectId(existing.id);

      if (activeAssignmentCount > 0) {
        throw new AppError(
          "CONFLICT",
          "Cannot change the project manager while active employee assignments exist.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const projects = this.projects.withClient(tx);
      const employees = this.employees.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      if (input.managerId) {
        await this.assertProjectManager(employees, input.managerId);
      }

      const project = await projects.update({
        id: input.id,
        name: input.name?.trim(),
        location: normalizeText(input.location),
        managerId: input.managerId,
        status: input.status,
        notes: normalizeText(input.notes),
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "PROJECT",
        entityId: project.id,
        actionType:
          input.managerId !== undefined && input.managerId !== existing.managerId
            ? "PROJECT_MANAGER_REASSIGNED"
            : input.status !== undefined && input.status !== existing.status
              ? "STATUS_CHANGED"
              : "UPDATED",
        summaryKey:
          input.managerId !== undefined && input.managerId !== existing.managerId
            ? "audit.project.manager_reassigned"
            : input.status !== undefined && input.status !== existing.status
              ? "audit.project.status_changed"
              : "audit.project.updated",
        actorUserId,
        before: toProjectSnapshot(existing),
        after: toProjectSnapshot(project),
        occurredAt: now,
      });

      if (input.managerId !== undefined && input.managerId !== existing.managerId) {
        if (existing.managerId) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE",
            entityId: existing.managerId,
            actionType: "PROJECT_MANAGER_UNASSIGNED",
            summaryKey: "audit.employee.project_removed",
            actorUserId,
            metadata: {
              projectId: project.id,
              projectName: project.name,
            },
            occurredAt: now,
          });
        }

        if (project.managerId) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE",
            entityId: project.managerId,
            actionType:
              existing.managerId && existing.managerId !== project.managerId
                ? "PROJECT_MANAGER_REASSIGNED"
                : "PROJECT_MANAGER_ASSIGNED",
            summaryKey:
              existing.managerId && existing.managerId !== project.managerId
                ? "audit.employee.project_reassigned"
                : "audit.employee.project_assigned",
            actorUserId,
            metadata: {
              projectId: project.id,
              projectName: project.name,
              previousManagerId: existing.managerId,
            },
            occurredAt: now,
          });
        }
      }

      return project;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const project = await this.getById(id);

    const activeAssignmentCount =
      await this.employeeProjectAssignments.countActiveByProjectId(id);

    if (activeAssignmentCount > 0) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a project while active employee assignments exist.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const projects = this.projects.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const deleted = await projects.softDelete(id, now, now);

      if (deleted) {
        await recordAuditLog(audits, {
          entityType: "PROJECT",
          entityId: project.id,
          actionType: "SOFT_DELETED",
          summaryKey: "audit.project.soft_deleted",
          actorUserId,
          before: toProjectSnapshot(project),
          after: {
            ...toProjectSnapshot(project),
            deletedAt: now.toISOString(),
          },
          occurredAt: now,
        });

        if (project.managerId) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE",
            entityId: project.managerId,
            actionType: "PROJECT_MANAGER_UNASSIGNED",
            summaryKey: "audit.employee.project_removed",
            actorUserId,
            metadata: {
              projectId: project.id,
              projectName: project.name,
            },
            occurredAt: now,
          });
        }
      }

      return deleted;
    });
  }

  private async assertProjectManager(
    employees: PrismaEmployeeRepository,
    managerId: string,
  ): Promise<void> {
    const manager = await employees.getById(managerId);

    if (!manager) {
      throw new AppError("NOT_FOUND", "Project manager not found.");
    }

    const policy = getEmployeeRolePolicy(manager.role.key);

    if (!policy.canManageProjects) {
      throw new AppError("BAD_REQUEST", "Selected employee cannot manage projects.");
    }

    if (manager.status !== "ACTIVE") {
      throw new AppError("BAD_REQUEST", "Project manager must be active.");
    }
  }
}
