import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { recordAuditLog } from "../audit/audit-log.helpers";
import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { PrismaProjectRepository } from "../projects/prisma-project.repository";
import { PrismaRoleRepository } from "../roles/prisma-role.repository";
import { AppError } from "../shared/app-error";
import { PrismaWarehouseRepository } from "../warehouses/prisma-warehouse.repository";
import { getEmployeeRolePolicy } from "./employee-role-policy";
import type { Employee, EmployeeListFilters, EmployeeStatus } from "./employee.entity";
import { PrismaEmployeeManagerAssignmentRepository } from "./prisma-employee-manager-assignment.repository";
import { PrismaEmployeeProjectAssignmentRepository } from "./prisma-employee-project-assignment.repository";
import { PrismaEmployeeRepository } from "./prisma-employee.repository";

type CreateEmployeeInput = {
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  roleId: string;
  notes?: string | null;
  managerId?: string;
  projectId?: string;
};

type UpdateEmployeeInput = {
  id: string;
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
  roleId?: string;
  status?: EmployeeStatus;
  notes?: string | null;
};

const normalizeText = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

const toEmployeeSnapshot = (employee: Employee) => ({
  id: employee.id,
  firstName: employee.firstName,
  lastName: employee.lastName,
  phone: employee.phone,
  roleId: employee.roleId,
  roleKey: employee.role.key,
  status: employee.status,
  notes: employee.notes,
  deletedAt: employee.deletedAt,
});

export class EmployeeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly employees: PrismaEmployeeRepository,
    private readonly roles: PrismaRoleRepository,
    private readonly managerAssignments: PrismaEmployeeManagerAssignmentRepository,
    private readonly projectAssignments: PrismaEmployeeProjectAssignmentRepository,
    private readonly projects: PrismaProjectRepository,
    private readonly warehouses: PrismaWarehouseRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  list(filters?: EmployeeListFilters): Promise<Employee[]> {
    return this.employees.list(filters);
  }

  async getById(id: string): Promise<Employee> {
    const employee = await this.employees.getById(id);

    if (!employee) {
      throw new AppError("NOT_FOUND", "Employee not found.");
    }

    return employee;
  }

  async create(input: CreateEmployeeInput, actorUserId: string | null): Promise<Employee> {
    return this.prisma.$transaction(async (tx) => {
      const employees = this.employees.withClient(tx);
      const roles = this.roles.withClient(tx);
      const managerAssignments = this.managerAssignments.withClient(tx);
      const projectAssignments = this.projectAssignments.withClient(tx);
      const projects = this.projects.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();

      const role = await roles.getById(input.roleId);

      if (!role) {
        throw new AppError("NOT_FOUND", "Role not found.");
      }

      const rolePolicy = getEmployeeRolePolicy(role.key);

      if (rolePolicy.requiresManager && !input.managerId) {
        throw new AppError("BAD_REQUEST", "Workers must be created with a manager.");
      }

      if (rolePolicy.requiresProject && !input.projectId) {
        throw new AppError("BAD_REQUEST", "Workers must be created with a project.");
      }

      const employee = await employees.create({
        id: randomUUID(),
        firstName: input.firstName.trim(),
        lastName: normalizeText(input.lastName) ?? null,
        phone: normalizeText(input.phone) ?? null,
        roleId: role.id,
        status: "ACTIVE",
        notes: normalizeText(input.notes) ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      if (input.managerId) {
        const manager = await employees.getById(input.managerId);

        if (!manager) {
          throw new AppError("NOT_FOUND", "Manager not found.");
        }

        const managerPolicy = getEmployeeRolePolicy(manager.role.key);

        if (!managerPolicy.canSuperviseEmployees) {
          throw new AppError("BAD_REQUEST", "Selected employee cannot supervise workers.");
        }

        if (manager.status !== "ACTIVE") {
          throw new AppError("BAD_REQUEST", "Manager must be active.");
        }

        if (manager.id === employee.id) {
          throw new AppError("BAD_REQUEST", "An employee cannot manage themselves.");
        }

        await managerAssignments.create({
          id: randomUUID(),
          workerId: employee.id,
          managerId: manager.id,
          status: "ACTIVE",
          startDate: now,
          endDate: null,
          notes: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (input.projectId) {
        const project = await projects.getById(input.projectId);

        if (!project) {
          throw new AppError("NOT_FOUND", "Project not found.");
        }

        if (project.status !== "ACTIVE") {
          throw new AppError("BAD_REQUEST", "Project must be active.");
        }

        if (rolePolicy.requiresManager && input.managerId && project.managerId !== input.managerId) {
          throw new AppError(
            "BAD_REQUEST",
            "Worker project must belong to the assigned manager.",
          );
        }

        await projectAssignments.create({
          id: randomUUID(),
          employeeId: employee.id,
          projectId: project.id,
          status: "ACTIVE",
          startDate: now,
          endDate: null,
          notes: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      const createdEmployee = await employees.getById(employee.id);

      if (!createdEmployee) {
        throw new AppError("NOT_FOUND", "Employee not found after creation.");
      }

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE",
        entityId: createdEmployee.id,
        actionType: "CREATED",
        summaryKey: "audit.employee.created",
        actorUserId,
        after: toEmployeeSnapshot(createdEmployee),
        occurredAt: now,
      });

      if (input.managerId) {
        const assignment = await managerAssignments.getActiveByWorkerId(employee.id);

        if (assignment) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE_MANAGER_ASSIGNMENT",
            entityId: assignment.id,
            actionType: "MANAGER_ASSIGNED",
            summaryKey: "audit.employee_manager_assignment.created",
            actorUserId,
            after: {
              id: assignment.id,
              workerId: assignment.workerId,
              managerId: assignment.managerId,
              status: assignment.status,
              startDate: assignment.startDate,
              endDate: assignment.endDate,
              notes: assignment.notes,
              deletedAt: assignment.deletedAt,
            },
            occurredAt: now,
          });
        }
      }

      if (input.projectId) {
        const assignments = await projectAssignments.listActiveByEmployeeId(employee.id);
        const assignment = assignments.find(
          (item) => item.projectId === input.projectId,
        );

        if (assignment) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE_PROJECT_ASSIGNMENT",
            entityId: assignment.id,
            actionType: "PROJECT_ASSIGNED",
            summaryKey: "audit.employee_project_assignment.created",
            actorUserId,
            after: {
              id: assignment.id,
              employeeId: assignment.employeeId,
              projectId: assignment.projectId,
              status: assignment.status,
              startDate: assignment.startDate,
              endDate: assignment.endDate,
              notes: assignment.notes,
              deletedAt: assignment.deletedAt,
            },
            occurredAt: now,
          });
        }
      }

      return createdEmployee;
    });
  }

  async update(input: UpdateEmployeeInput, actorUserId: string | null): Promise<Employee> {
    const existing = await this.getById(input.id);

    if (
      input.firstName === undefined &&
      input.lastName === undefined &&
      input.phone === undefined &&
      input.roleId === undefined &&
      input.status === undefined &&
      input.notes === undefined
    ) {
      throw new AppError("BAD_REQUEST", "No employee fields were provided.");
    }

    return this.prisma.$transaction(async (tx) => {
      const employees = this.employees.withClient(tx);
      const roles = this.roles.withClient(tx);
      const managerAssignments = this.managerAssignments.withClient(tx);
      const projectAssignments = this.projectAssignments.withClient(tx);
      const projects = this.projects.withClient(tx);
      const warehouses = this.warehouses.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const nextRole =
        input.roleId && input.roleId !== existing.roleId
          ? await roles.getById(input.roleId)
          : existing.role;

      if (!nextRole) {
        throw new AppError("NOT_FOUND", "Role not found.");
      }

      const nextRolePolicy = getEmployeeRolePolicy(nextRole.key);
      const nextStatus = input.status ?? existing.status;

      await this.assertLeadershipConstraints(
        existing.id,
        nextRolePolicy,
        nextStatus,
        managerAssignments,
        projects,
        warehouses,
      );

      const activeManagerAssignment = await managerAssignments.getActiveByWorkerId(existing.id);
      const activeProjectAssignments =
        await projectAssignments.listActiveByEmployeeId(existing.id);

      if (nextStatus === "ACTIVE" && nextRolePolicy.requiresManager && !activeManagerAssignment) {
        throw new AppError(
          "BAD_REQUEST",
          "Workers must have an active manager assignment before becoming active.",
        );
      }

      if (nextStatus === "ACTIVE" && nextRolePolicy.requiresProject && activeProjectAssignments.length === 0) {
        throw new AppError(
          "BAD_REQUEST",
          "Workers must have at least one active project assignment before becoming active.",
        );
      }

      const updated = await employees.update({
        id: input.id,
        firstName: input.firstName?.trim(),
        lastName: normalizeText(input.lastName),
        phone: normalizeText(input.phone),
        roleId: nextRole.id,
        status: input.status,
        notes: normalizeText(input.notes),
        updatedAt: now,
      });

      if (nextStatus !== "ACTIVE") {
        const managerAssignmentBefore =
          await managerAssignments.getActiveByWorkerId(existing.id);
        const projectAssignmentsBefore =
          await projectAssignments.listActiveByEmployeeId(existing.id);
        await managerAssignments.endActiveByWorkerId(existing.id, now, now);
        await projectAssignments.endActiveByEmployeeId(existing.id, now, now);

        if (managerAssignmentBefore) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE_MANAGER_ASSIGNMENT",
            entityId: managerAssignmentBefore.id,
            actionType: "MANAGER_UNASSIGNED",
            summaryKey: "audit.employee_manager_assignment.auto_closed",
            actorUserId,
            before: {
              id: managerAssignmentBefore.id,
              workerId: managerAssignmentBefore.workerId,
              managerId: managerAssignmentBefore.managerId,
              status: managerAssignmentBefore.status,
              startDate: managerAssignmentBefore.startDate,
              endDate: managerAssignmentBefore.endDate,
              notes: managerAssignmentBefore.notes,
              deletedAt: managerAssignmentBefore.deletedAt,
            },
            after: {
              id: managerAssignmentBefore.id,
              workerId: managerAssignmentBefore.workerId,
              managerId: managerAssignmentBefore.managerId,
              status: "ENDED",
              startDate: managerAssignmentBefore.startDate,
              endDate: now.toISOString(),
              notes: managerAssignmentBefore.notes,
              deletedAt: managerAssignmentBefore.deletedAt,
            },
            occurredAt: now,
          });
        }

        for (const assignment of projectAssignmentsBefore) {
          await recordAuditLog(audits, {
            entityType: "EMPLOYEE_PROJECT_ASSIGNMENT",
            entityId: assignment.id,
            actionType: "PROJECT_UNASSIGNED",
            summaryKey: "audit.employee_project_assignment.auto_closed",
            actorUserId,
            before: {
              id: assignment.id,
              employeeId: assignment.employeeId,
              projectId: assignment.projectId,
              status: assignment.status,
              startDate: assignment.startDate,
              endDate: assignment.endDate,
              notes: assignment.notes,
              deletedAt: assignment.deletedAt,
            },
            after: {
              id: assignment.id,
              employeeId: assignment.employeeId,
              projectId: assignment.projectId,
              status: "ENDED",
              startDate: assignment.startDate,
              endDate: now.toISOString(),
              notes: assignment.notes,
              deletedAt: assignment.deletedAt,
            },
            occurredAt: now,
          });
        }
      }

      const refreshed = await employees.getById(updated.id);

      if (!refreshed) {
        throw new AppError("NOT_FOUND", "Employee not found after update.");
      }

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE",
        entityId: refreshed.id,
        actionType:
          input.status !== undefined && input.status !== existing.status
            ? "STATUS_CHANGED"
            : "UPDATED",
        summaryKey:
          input.status !== undefined && input.status !== existing.status
            ? "audit.employee.status_changed"
            : "audit.employee.updated",
        actorUserId,
        before: toEmployeeSnapshot(existing),
        after: toEmployeeSnapshot(refreshed),
        occurredAt: now,
      });

      return refreshed;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const employee = await this.getById(id);

    return this.prisma.$transaction(async (tx) => {
      const employees = this.employees.withClient(tx);
      const managerAssignments = this.managerAssignments.withClient(tx);
      const projectAssignments = this.projectAssignments.withClient(tx);
      const projects = this.projects.withClient(tx);
      const warehouses = this.warehouses.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const managerAssignmentBefore =
        await managerAssignments.getActiveByWorkerId(employee.id);
      const projectAssignmentsBefore =
        await projectAssignments.listActiveByEmployeeId(employee.id);

      await this.assertLeadershipConstraints(
        employee.id,
        getEmployeeRolePolicy(employee.role.key),
        "LEFT",
        managerAssignments,
        projects,
        warehouses,
      );

      await managerAssignments.endActiveByWorkerId(employee.id, now, now);
      await projectAssignments.endActiveByEmployeeId(employee.id, now, now);
      const deleted = await employees.softDelete(employee.id, now, now);

      if (managerAssignmentBefore) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE_MANAGER_ASSIGNMENT",
          entityId: managerAssignmentBefore.id,
          actionType: "MANAGER_UNASSIGNED",
          summaryKey: "audit.employee_manager_assignment.auto_closed",
          actorUserId,
          before: {
            id: managerAssignmentBefore.id,
            workerId: managerAssignmentBefore.workerId,
            managerId: managerAssignmentBefore.managerId,
            status: managerAssignmentBefore.status,
            startDate: managerAssignmentBefore.startDate,
            endDate: managerAssignmentBefore.endDate,
            notes: managerAssignmentBefore.notes,
            deletedAt: managerAssignmentBefore.deletedAt,
          },
          after: {
            id: managerAssignmentBefore.id,
            workerId: managerAssignmentBefore.workerId,
            managerId: managerAssignmentBefore.managerId,
            status: "ENDED",
            startDate: managerAssignmentBefore.startDate,
            endDate: now.toISOString(),
            notes: managerAssignmentBefore.notes,
            deletedAt: managerAssignmentBefore.deletedAt,
          },
          occurredAt: now,
        });
      }

      for (const assignment of projectAssignmentsBefore) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE_PROJECT_ASSIGNMENT",
          entityId: assignment.id,
          actionType: "PROJECT_UNASSIGNED",
          summaryKey: "audit.employee_project_assignment.auto_closed",
          actorUserId,
          before: {
            id: assignment.id,
            employeeId: assignment.employeeId,
            projectId: assignment.projectId,
            status: assignment.status,
            startDate: assignment.startDate,
            endDate: assignment.endDate,
            notes: assignment.notes,
            deletedAt: assignment.deletedAt,
          },
          after: {
            id: assignment.id,
            employeeId: assignment.employeeId,
            projectId: assignment.projectId,
            status: "ENDED",
            startDate: assignment.startDate,
            endDate: now.toISOString(),
            notes: assignment.notes,
            deletedAt: assignment.deletedAt,
          },
          occurredAt: now,
        });
      }

      if (deleted) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE",
          entityId: employee.id,
          actionType: "SOFT_DELETED",
          summaryKey: "audit.employee.soft_deleted",
          actorUserId,
          before: toEmployeeSnapshot(employee),
          after: {
            ...toEmployeeSnapshot(employee),
            deletedAt: now.toISOString(),
          },
          occurredAt: now,
        });
      }

      return deleted;
    });
  }

  private async assertLeadershipConstraints(
    employeeId: string,
    nextRolePolicy: ReturnType<typeof getEmployeeRolePolicy>,
    nextStatus: EmployeeStatus,
    managerAssignments: PrismaEmployeeManagerAssignmentRepository,
    projects: PrismaProjectRepository,
    warehouses: PrismaWarehouseRepository,
  ): Promise<void> {
    const managedEmployeeCount =
      await managerAssignments.countActiveByManagerId(employeeId);
    const managedProjectCount = await projects.countByManagerId(employeeId);
    const managedWarehouseCount = await warehouses.countByManagerId(employeeId);

    if (
      managedEmployeeCount > 0 &&
      (!nextRolePolicy.canSuperviseEmployees || nextStatus !== "ACTIVE")
    ) {
      throw new AppError(
        "CONFLICT",
        "Employee cannot change role or status while supervising active workers.",
      );
    }

    if (
      managedProjectCount > 0 &&
      (!nextRolePolicy.canManageProjects || nextStatus !== "ACTIVE")
    ) {
      throw new AppError(
        "CONFLICT",
        "Employee cannot change role or status while managing projects.",
      );
    }

    if (
      managedWarehouseCount > 0 &&
      (!nextRolePolicy.canManageWarehouses || nextStatus !== "ACTIVE")
    ) {
      throw new AppError(
        "CONFLICT",
        "Employee cannot change role or status while managing warehouses.",
      );
    }
  }
}
