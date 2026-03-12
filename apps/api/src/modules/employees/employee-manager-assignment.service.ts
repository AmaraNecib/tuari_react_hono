import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { recordAuditLog } from "../audit/audit-log.helpers";
import { PrismaAuditLogRepository } from "../audit/prisma-audit-log.repository";
import { AppError } from "../shared/app-error";
import { getEmployeeRolePolicy } from "./employee-role-policy";
import type {
  EmployeeManagerAssignment,
  EmployeeManagerAssignmentListFilters,
} from "./employee-manager-assignment.entity";
import { PrismaEmployeeManagerAssignmentRepository } from "./prisma-employee-manager-assignment.repository";
import { PrismaEmployeeProjectAssignmentRepository } from "./prisma-employee-project-assignment.repository";
import { PrismaEmployeeRepository } from "./prisma-employee.repository";

type CreateEmployeeManagerAssignmentInput = {
  workerId: string;
  managerId: string;
  status?: EmployeeManagerAssignment["status"];
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
};

type UpdateEmployeeManagerAssignmentInput = {
  id: string;
  managerId?: string;
  status?: EmployeeManagerAssignment["status"];
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
};

const resolveStartDate = (value?: string) => (value ? new Date(value) : new Date());
const resolveNullableDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);
const normalizeText = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

const toAssignmentSnapshot = (assignment: EmployeeManagerAssignment) => ({
  id: assignment.id,
  workerId: assignment.workerId,
  managerId: assignment.managerId,
  status: assignment.status,
  startDate: assignment.startDate,
  endDate: assignment.endDate,
  notes: assignment.notes,
  deletedAt: assignment.deletedAt,
});

export class EmployeeManagerAssignmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly assignments: PrismaEmployeeManagerAssignmentRepository,
    private readonly employees: PrismaEmployeeRepository,
    private readonly projectAssignments: PrismaEmployeeProjectAssignmentRepository,
    private readonly audits: PrismaAuditLogRepository,
  ) {}

  list(filters?: EmployeeManagerAssignmentListFilters): Promise<EmployeeManagerAssignment[]> {
    return this.assignments.list(filters);
  }

  async getById(id: string): Promise<EmployeeManagerAssignment> {
    const assignment = await this.assignments.getById(id);

    if (!assignment) {
      throw new AppError("NOT_FOUND", "Employee manager assignment not found.");
    }

    return assignment;
  }

  async create(
    input: CreateEmployeeManagerAssignmentInput,
    actorUserId: string | null,
  ): Promise<EmployeeManagerAssignment> {
    return this.prisma.$transaction(async (tx) => {
      const assignments = this.assignments.withClient(tx);
      const employees = this.employees.withClient(tx);
      const projectAssignments = this.projectAssignments.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const startDate = resolveStartDate(input.startDate);
      const requestedStatus = input.status ?? "ACTIVE";
      const endDate = resolveNullableDate(input.endDate);
      const notes = normalizeText(input.notes) ?? null;

      this.assertChronology(startDate, endDate);

      const worker = await this.requireEmployee(employees, input.workerId, "Employee");
      const manager = await this.requireEmployee(employees, input.managerId, "Manager");

      this.assertManager(worker.id, manager.id, manager.role.key);

      const existingActive = await assignments.getActiveByWorkerId(worker.id);

      if (requestedStatus === "ACTIVE" && existingActive) {
        throw new AppError("CONFLICT", "Employee already has an active manager assignment.");
      }

      if (requestedStatus === "ACTIVE" && worker.status !== "ACTIVE") {
        throw new AppError("BAD_REQUEST", "Only active employees can receive active manager assignments.");
      }

      if (requestedStatus === "ACTIVE" && manager.status !== "ACTIVE") {
        throw new AppError("BAD_REQUEST", "Manager must be active.");
      }

      const workerPolicy = getEmployeeRolePolicy(worker.role.key);

      if (requestedStatus === "ACTIVE" && workerPolicy.requiresProject) {
        const activeProjectAssignments =
          await projectAssignments.listActiveByEmployeeId(worker.id);

        for (const assignment of activeProjectAssignments) {
          if (assignment.project.managerId !== manager.id) {
            throw new AppError(
              "BAD_REQUEST",
              "Worker projects must belong to the assigned manager.",
            );
          }
        }
      }

      const assignment = await assignments.create({
        id: randomUUID(),
        workerId: worker.id,
        managerId: manager.id,
        status: requestedStatus,
        startDate,
        endDate: requestedStatus === "ACTIVE" ? null : endDate ?? startDate,
        notes,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE_MANAGER_ASSIGNMENT",
        entityId: assignment.id,
        actionType: "MANAGER_ASSIGNED",
        summaryKey: "audit.employee_manager_assignment.created",
        actorUserId,
        after: toAssignmentSnapshot(assignment),
        metadata: {
          workerId: worker.id,
          managerId: manager.id,
        },
        occurredAt: now,
      });

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE",
        entityId: worker.id,
        actionType: "MANAGER_ASSIGNED",
        summaryKey: "audit.employee.manager_assigned",
        actorUserId,
        metadata: {
          assignmentId: assignment.id,
          managerId: manager.id,
          managerName: manager.displayName,
        },
        occurredAt: now,
      });

      return assignment;
    });
  }

  async update(
    input: UpdateEmployeeManagerAssignmentInput,
    actorUserId: string | null,
  ): Promise<EmployeeManagerAssignment> {
    const existing = await this.getById(input.id);

    if (
      input.managerId === undefined &&
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
      const projectAssignments = this.projectAssignments.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const nextManagerId = input.managerId ?? existing.managerId;
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

      const worker = await this.requireEmployee(employees, existing.workerId, "Employee");
      const manager = await this.requireEmployee(employees, nextManagerId, "Manager");

      this.assertManager(worker.id, manager.id, manager.role.key);

      const activeAssignment = await assignments.getActiveByWorkerId(worker.id);

      if (
        nextStatus === "ACTIVE" &&
        activeAssignment &&
        activeAssignment.id !== existing.id
      ) {
        throw new AppError("CONFLICT", "Employee already has another active manager assignment.");
      }

      if (nextStatus === "ACTIVE" && worker.status !== "ACTIVE") {
        throw new AppError("BAD_REQUEST", "Only active employees can receive active manager assignments.");
      }

      if (nextStatus === "ACTIVE" && manager.status !== "ACTIVE") {
        throw new AppError("BAD_REQUEST", "Manager must be active.");
      }

      const workerPolicy = getEmployeeRolePolicy(worker.role.key);

      if (nextStatus === "ACTIVE" && workerPolicy.requiresProject) {
        const activeProjectAssignments =
          await projectAssignments.listActiveByEmployeeId(worker.id);

        for (const assignment of activeProjectAssignments) {
          if (assignment.project.managerId !== manager.id) {
            throw new AppError(
              "BAD_REQUEST",
              "Worker projects must belong to the assigned manager.",
            );
          }
        }
      }

      const assignment = await assignments.update({
        id: input.id,
        managerId: input.managerId,
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
        input.managerId !== undefined && input.managerId !== existing.managerId
          ? "MANAGER_REASSIGNED"
          : nextStatus !== existing.status && nextStatus !== "ACTIVE"
            ? "MANAGER_UNASSIGNED"
            : "UPDATED";

      await recordAuditLog(audits, {
        entityType: "EMPLOYEE_MANAGER_ASSIGNMENT",
        entityId: assignment.id,
        actionType,
        summaryKey:
          actionType === "MANAGER_REASSIGNED"
            ? "audit.employee_manager_assignment.reassigned"
            : actionType === "MANAGER_UNASSIGNED"
              ? "audit.employee_manager_assignment.unassigned"
              : "audit.employee_manager_assignment.updated",
        actorUserId,
        before: toAssignmentSnapshot(existing),
        after: toAssignmentSnapshot(assignment),
        occurredAt: now,
      });

      if (actionType !== "UPDATED") {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE",
          entityId: worker.id,
          actionType,
          summaryKey:
            actionType === "MANAGER_REASSIGNED"
              ? "audit.employee.manager_reassigned"
              : "audit.employee.manager_unassigned",
          actorUserId,
          metadata: {
            assignmentId: assignment.id,
            previousManagerId: existing.managerId,
            nextManagerId: assignment.managerId,
            managerName: manager.displayName,
          },
          occurredAt: now,
        });
      }

      return assignment;
    });
  }

  async softDelete(id: string, actorUserId: string | null): Promise<boolean> {
    const assignment = await this.getById(id);
    const worker = await this.requireEmployee(this.employees, assignment.workerId, "Employee");
    const workerPolicy = getEmployeeRolePolicy(worker.role.key);

    if (
      assignment.status === "ACTIVE" &&
      worker.status === "ACTIVE" &&
      workerPolicy.requiresManager
    ) {
      throw new AppError(
        "CONFLICT",
        "Active workers cannot lose their manager assignment through deletion.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const assignments = this.assignments.withClient(tx);
      const audits = this.audits.withClient(tx);
      const now = new Date();
      const deleted = await assignments.softDelete(id, now, now);

      if (deleted) {
        await recordAuditLog(audits, {
          entityType: "EMPLOYEE_MANAGER_ASSIGNMENT",
          entityId: assignment.id,
          actionType: "MANAGER_UNASSIGNED",
          summaryKey: "audit.employee_manager_assignment.soft_deleted",
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
          entityId: assignment.workerId,
          actionType: "MANAGER_UNASSIGNED",
          summaryKey: "audit.employee.manager_unassigned",
          actorUserId,
          metadata: {
            assignmentId: assignment.id,
            managerId: assignment.managerId,
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
    label: string,
  ) {
    const employee = await employees.getById(employeeId);

    if (!employee) {
      throw new AppError("NOT_FOUND", `${label} not found.`);
    }

    return employee;
  }

  private assertManager(
    workerId: string,
    managerId: string,
    managerRoleKey: string,
  ): void {
    if (workerId === managerId) {
      throw new AppError("BAD_REQUEST", "An employee cannot manage themselves.");
    }

    const managerPolicy = getEmployeeRolePolicy(managerRoleKey);

    if (!managerPolicy.canSuperviseEmployees) {
      throw new AppError("BAD_REQUEST", "Selected employee cannot supervise workers.");
    }
  }

  private assertChronology(startDate: Date, endDate: Date | null | undefined): void {
    if (endDate && endDate < startDate) {
      throw new AppError("BAD_REQUEST", "Assignment end date must be after the start date.");
    }
  }
}
