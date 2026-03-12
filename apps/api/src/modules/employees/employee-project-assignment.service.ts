import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { recordAuditLog } from "../audit/audit-log.helpers";
import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { PrismaProjectRepository } from "../projects/prisma-project.repository";
import { AppError } from "../shared/app-error";
import { getEmployeeRolePolicy } from "./employee-role-policy";
import type {
  EmployeeProjectAssignment,
  EmployeeProjectAssignmentListFilters,
} from "./employee-project-assignment.entity";
import { PrismaEmployeeManagerAssignmentRepository } from "./prisma-employee-manager-assignment.repository";
import { PrismaEmployeeProjectAssignmentRepository } from "./prisma-employee-project-assignment.repository";
import { PrismaEmployeeRepository } from "./prisma-employee.repository";

type CreateEmployeeProjectAssignmentInput = {
  employeeId: string;
  projectId: string;
  status?: EmployeeProjectAssignment["status"];
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
};

type UpdateEmployeeProjectAssignmentInput = {
  id: string;
  projectId?: string;
  status?: EmployeeProjectAssignment["status"];
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
};

const resolveStartDate = (value?: string) => (value ? new Date(value) : new Date());
const resolveNullableDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);
const normalizeText = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

const toAssignmentSnapshot = (assignment: EmployeeProjectAssignment) => ({
  id: assignment.id,
  employeeId: assignment.employeeId,
  projectId: assignment.projectId,
  status: assignment.status,
  startDate: assignment.startDate,
  endDate: assignment.endDate,
  notes: assignment.notes,
  deletedAt: assignment.deletedAt,
});

export class EmployeeProjectAssignmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly assignments: PrismaEmployeeProjectAssignmentRepository,
    private readonly employees: PrismaEmployeeRepository,
    private readonly projects: PrismaProjectRepository,
    private readonly managerAssignments: PrismaEmployeeManagerAssignmentRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  list(filters?: EmployeeProjectAssignmentListFilters): Promise<EmployeeProjectAssignment[]> {
    return this.assignments.list(filters);
  }

  async getById(id: string): Promise<EmployeeProjectAssignment> {
    const assignment = await this.assignments.getById(id);

    if (!assignment) {
      throw new AppError("NOT_FOUND", "Employee project assignment not found.");
    }

    return assignment;
  }

  async create(
    input: CreateEmployeeProjectAssignmentInput,
    actorUserId: string | null,
  ): Promise<EmployeeProjectAssignment> {
    return this.prisma.$transaction(async (tx) => {
      const assignments = this.assignments.withClient(tx);
      const employees = this.employees.withClient(tx);
      const projects = this.projects.withClient(tx);
      const managerAssignments = this.managerAssignments.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const startDate = resolveStartDate(input.startDate);
      const requestedStatus = input.status ?? "ACTIVE";
      const endDate = resolveNullableDate(input.endDate);
      const notes = normalizeText(input.notes) ?? null;

      this.assertChronology(startDate, endDate);

      const employee = await this.requireEmployee(employees, input.employeeId);
      const project = await this.requireProject(projects, input.projectId);

      const existingActive = await assignments.getActiveByEmployeeAndProject(
        employee.id,
        project.id,
      );

      if (requestedStatus === "ACTIVE" && existingActive) {
        throw new AppError(
          "CONFLICT",
          "Employee already has an active assignment to this project.",
        );
      }

      if (requestedStatus === "ACTIVE" && employee.status !== "ACTIVE") {
        throw new AppError("BAD_REQUEST", "Only active employees can receive active project assignments.");
      }

      if (requestedStatus === "ACTIVE" && project.status !== "ACTIVE") {
        throw new AppError("BAD_REQUEST", "Only active projects can receive active assignments.");
      }

      const employeePolicy = getEmployeeRolePolicy(employee.role.key);

      if (requestedStatus === "ACTIVE" && employeePolicy.requiresManager) {
        const managerAssignment = await managerAssignments.getActiveByWorkerId(employee.id);

        if (!managerAssignment) {
          throw new AppError(
            "BAD_REQUEST",
            "Worker must have an active manager before being assigned to a project.",
          );
        }

        if (project.managerId !== managerAssignment.managerId) {
          throw new AppError(
            "BAD_REQUEST",
            "Worker projects must belong to the worker's manager.",
          );
        }
      }

      const assignment = await assignments.create({
        id: randomUUID(),
        employeeId: employee.id,
        projectId: project.id,
        status: requestedStatus,
        startDate,
        endDate: requestedStatus === "ACTIVE" ? null : endDate ?? startDate,
        notes,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE_PROJECT_ASSIGNMENT",
        entityId: assignment.id,
        actionType: "PROJECT_ASSIGNED",
        summaryKey: "audit.employee_project_assignment.created",
        actorUserId,
        after: toAssignmentSnapshot(assignment),
        metadata: {
          employeeId: employee.id,
          projectId: project.id,
        },
        occurredAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE",
        entityId: employee.id,
        actionType: "PROJECT_ASSIGNED",
        summaryKey: "audit.employee.project_assigned",
        actorUserId,
        metadata: {
          assignmentId: assignment.id,
          projectId: project.id,
          projectName: project.name,
        },
        occurredAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "PROJECT",
        entityId: project.id,
        actionType: "PROJECT_ASSIGNED",
        summaryKey: "audit.project.employee_assigned",
        actorUserId,
        metadata: {
          assignmentId: assignment.id,
          employeeId: employee.id,
          employeeName: employee.displayName,
        },
        occurredAt: now,
      });

      return assignment;
    });
  }

  async update(
    input: UpdateEmployeeProjectAssignmentInput,
    actorUserId: string | null,
  ): Promise<EmployeeProjectAssignment> {
    const existing = await this.getById(input.id);

    if (
      input.projectId === undefined &&
      input.status === undefined &&
      input.startDate === undefined &&
      input.endDate === undefined &&
      input.notes === undefined
    ) {
      throw new AppError("BAD_REQUEST", "No assignment fields were provided.");
    }

    return this.prisma.$transaction(async (tx) => {
      const assignments = this.assignments.withClient(tx);
      const employees = this.employees.withClient(tx);
      const projects = this.projects.withClient(tx);
      const managerAssignments = this.managerAssignments.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const employee = await this.requireEmployee(employees, existing.employeeId);
      const project = await this.requireProject(projects, input.projectId ?? existing.projectId);
      const nextStatus = input.status ?? existing.status;
      const nextStartDate = input.startDate
        ? new Date(input.startDate)
        : new Date(existing.startDate);
      const requestedEndDate = resolveNullableDate(input.endDate);
      const nextEndDate =
        nextStatus === "ACTIVE"
          ? null
          : requestedEndDate === undefined
            ? existing.endDate
              ? new Date(existing.endDate)
              : new Date()
            : requestedEndDate ?? new Date();

      this.assertChronology(nextStartDate, nextEndDate);

      if (nextStatus === "ACTIVE") {
        const duplicate = await assignments.getActiveByEmployeeAndProject(
          employee.id,
          project.id,
        );

        if (duplicate && duplicate.id !== existing.id) {
          throw new AppError(
            "CONFLICT",
            "Employee already has another active assignment to this project.",
          );
        }

        if (employee.status !== "ACTIVE") {
          throw new AppError("BAD_REQUEST", "Only active employees can receive active project assignments.");
        }

        if (project.status !== "ACTIVE") {
          throw new AppError("BAD_REQUEST", "Only active projects can receive active assignments.");
        }
      }

      const employeePolicy = getEmployeeRolePolicy(employee.role.key);

      if (nextStatus === "ACTIVE" && employeePolicy.requiresManager) {
        const managerAssignment = await managerAssignments.getActiveByWorkerId(employee.id);

        if (!managerAssignment) {
          throw new AppError(
            "BAD_REQUEST",
            "Worker must have an active manager before being assigned to a project.",
          );
        }

        if (project.managerId !== managerAssignment.managerId) {
          throw new AppError(
            "BAD_REQUEST",
            "Worker projects must belong to the worker's manager.",
          );
        }
      }

      const assignment = await assignments.update({
        id: input.id,
        projectId: input.projectId,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate:
          input.endDate === undefined
            ? nextStatus === "ACTIVE"
              ? null
              : nextEndDate
            : resolveNullableDate(input.endDate),
        notes: normalizeText(input.notes),
        updatedAt: now,
      });

      const actionType =
        input.projectId !== undefined && input.projectId !== existing.projectId
          ? "PROJECT_REASSIGNED"
          : nextStatus !== existing.status
            ? nextStatus === "ACTIVE"
              ? "PROJECT_ASSIGNED"
              : "PROJECT_UNASSIGNED"
            : "UPDATED";

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE_PROJECT_ASSIGNMENT",
        entityId: assignment.id,
        actionType,
        summaryKey:
          actionType === "PROJECT_REASSIGNED"
            ? "audit.employee_project_assignment.reassigned"
            : actionType === "PROJECT_UNASSIGNED"
              ? "audit.employee_project_assignment.unassigned"
              : actionType === "PROJECT_ASSIGNED"
                ? "audit.employee_project_assignment.assigned"
                : "audit.employee_project_assignment.updated",
        actorUserId,
        before: toAssignmentSnapshot(existing),
        after: toAssignmentSnapshot(assignment),
        occurredAt: now,
      });

      if (actionType !== "UPDATED") {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE",
          entityId: employee.id,
          actionType,
          summaryKey:
            actionType === "PROJECT_REASSIGNED"
              ? "audit.employee.project_reassigned"
              : actionType === "PROJECT_UNASSIGNED"
                ? "audit.employee.project_unassigned"
                : "audit.employee.project_assigned",
          actorUserId,
          metadata: {
            assignmentId: assignment.id,
            previousProjectId: existing.projectId,
            nextProjectId: assignment.projectId,
            projectName: project.name,
          },
          occurredAt: now,
        });

        await recordAuditLog(audits, {
          entityType: "PROJECT",
          entityId: project.id,
          actionType,
          summaryKey:
            actionType === "PROJECT_REASSIGNED"
              ? "audit.project.employee_reassigned"
              : actionType === "PROJECT_UNASSIGNED"
                ? "audit.project.employee_unassigned"
                : "audit.project.employee_assigned",
          actorUserId,
          metadata: {
            assignmentId: assignment.id,
            employeeId: employee.id,
            employeeName: employee.displayName,
            previousProjectId: existing.projectId,
          },
          occurredAt: now,
        });
      }

      return assignment;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const assignment = await this.getById(id);
    const employee = await this.requireEmployee(this.employees, assignment.employeeId);
    const employeePolicy = getEmployeeRolePolicy(employee.role.key);

    if (
      assignment.status === "ACTIVE" &&
      employee.status === "ACTIVE" &&
      employeePolicy.requiresProject
    ) {
      const activeAssignments = await this.assignments.listActiveByEmployeeId(employee.id);

      if (activeAssignments.length <= 1) {
        throw new AppError(
          "CONFLICT",
          "Active workers cannot lose their final active project assignment through deletion.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const assignments = this.assignments.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const deleted = await assignments.softDelete(id, now, now);

      if (deleted) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE_PROJECT_ASSIGNMENT",
          entityId: assignment.id,
          actionType: "PROJECT_UNASSIGNED",
          summaryKey: "audit.employee_project_assignment.soft_deleted",
          actorUserId,
          before: toAssignmentSnapshot(assignment),
          after: {
            ...toAssignmentSnapshot(assignment),
            deletedAt: now.toISOString(),
          },
          occurredAt: now,
        });

        await recordAuditLog(audits, {
          entityType: "EMPLOYEE",
          entityId: assignment.employeeId,
          actionType: "PROJECT_UNASSIGNED",
          summaryKey: "audit.employee.project_unassigned",
          actorUserId,
          metadata: {
            assignmentId: assignment.id,
            projectId: assignment.projectId,
          },
          occurredAt: now,
        });
      }

      return deleted;
    });
  }

  private async requireEmployee(
    employees: PrismaEmployeeRepository,
    employeeId: string,
  ) {
    const employee = await employees.getById(employeeId);

    if (!employee) {
      throw new AppError("NOT_FOUND", "Employee not found.");
    }

    return employee;
  }

  private async requireProject(
    projects: PrismaProjectRepository,
    projectId: string,
  ) {
    const project = await projects.getById(projectId);

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found.");
    }

    return project;
  }

  private assertChronology(startDate: Date, endDate: Date | null | undefined): void {
    if (endDate && endDate < startDate) {
      throw new AppError("BAD_REQUEST", "Assignment end date must be after the start date.");
    }
  }
}
