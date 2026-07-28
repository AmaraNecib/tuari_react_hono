/**
 * Operations service.
 *
 * Owns project CRUD, warehouse CRUD, and the workplace assignment
 * lifecycle (project assignments, warehouse assignments). It is the
 * real implementation — not a facade over `CompanyService` — and
 * depends on a `CompanyRepository` plus a `WorkspaceMutationContext`
 * for transactions and audit authorization.
 *
 * Extracted from `CompanyService` as part of Plan 005 Phase 3
* (issue #177) so the former 2k-line service stops owning every
 * domain.
 */

import {
  type ProjectAssignmentCreateInput,
  type ProjectAssignmentEndInput,
  type ProjectCreateInput,
  type ProjectUpdateInput,
  type WarehouseAssignmentCreateInput,
  type WarehouseAssignmentEndInput,
  type WarehouseCreateInput,
  type WarehouseUpdateInput,
} from "@tuari/contracts";

import { CompanyError } from "./company.errors";
import {
  deleteResult,
  normalizeText,
  successResult,
} from "./company.helpers";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { CompanyRepository } from "./company.repository.contracts";
import {
  SYSTEM_ROLE_KEYS,
  type MutationAuditContext,
  type ProjectAssignmentListFilters,
  type ProjectListFilters,
  type WarehouseAssignmentListFilters,
  type WarehouseListFilters,
} from "./company.types";
import { normalizeAlgeriaTimestamp } from "./company-time";
import {
  ensureProjectTransitionAllowed,
  ensureWarehouseTransitionAllowed,
  listActiveWorkerIdsForProject,
  requireActiveEmployee,
  requireEmployeeWithRoleKey,
  requireProject,
  requireWarehouse,
} from "./company.entity-resolvers";

export class OperationsService {
  constructor(
    private readonly repository: CompanyRepository,
    private readonly mutation: WorkspaceMutationContext,
  ) {}

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  listProjects(filters?: ProjectListFilters) {
    return { items: this.repository.listProjects(filters) };
  }

  getProject(id: string) {
    return successResult("تم تحميل المشروع بنجاح.", requireProject(this.repository, id));
  }

  createProject(input: ProjectCreateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      if (input.managerId) {
        requireActiveEmployee(
          requireEmployeeWithRoleKey(
            this.repository,
            input.managerId,
            SYSTEM_ROLE_KEYS.projectManager,
            "managerId",
          ),
          "managerId",
        );
      }

      const project = this.repository.createProject(
        {
          name: input.name.trim(),
          location: normalizeText(input.location),
          managerId: input.managerId ?? null,
          status: input.status,
          notes: normalizeText(input.notes),
        },
        audit,
      );

      return successResult("تم إنشاء المشروع بنجاح.", project);
    });
  }

  updateProject(input: ProjectUpdateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const current = requireProject(this.repository, input.id);
      const nextManagerId = input.managerId !== undefined ? input.managerId : current.managerId;
      const nextStatus = input.status ?? current.status;

      ensureProjectTransitionAllowed(
        this.repository,
        current.id,
        current.managerId,
        input.managerId,
        input.status,
      );

      if (input.managerId && input.managerId !== current.managerId) {
        requireActiveEmployee(
          requireEmployeeWithRoleKey(
            this.repository,
            input.managerId,
            SYSTEM_ROLE_KEYS.projectManager,
            "managerId",
          ),
          "managerId",
        );
      }

      const reassignWorkerIds =
        current.managerId !== nextManagerId && nextManagerId && nextStatus === "ACTIVE"
          ? listActiveWorkerIdsForProject(this.repository, current.id, {
              requireManagerConsistencyWith: current.managerId,
            })
          : undefined;

      const project = this.repository.updateProject(
        {
          id: input.id,
          name: input.name?.trim(),
          location: input.location !== undefined ? normalizeText(input.location) : undefined,
          managerId: input.managerId,
          reassignWorkerIds,
          status: input.status,
          notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
        },
        audit,
      );

      return successResult("تم تحديث المشروع بنجاح.", project!);
    });
  }

  // ---------------------------------------------------------------------------
  // Warehouses
  // ---------------------------------------------------------------------------

  listWarehouses(filters?: WarehouseListFilters) {
    return { items: this.repository.listWarehouses(filters) };
  }

  getWarehouse(id: string) {
    return successResult("تم تحميل المستودع بنجاح.", requireWarehouse(this.repository, id));
  }

  createWarehouse(input: WarehouseCreateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      if (input.managerId) {
        requireActiveEmployee(
          requireEmployeeWithRoleKey(
            this.repository,
            input.managerId,
            SYSTEM_ROLE_KEYS.warehouseManager,
            "managerId",
          ),
          "managerId",
        );
      }

      const warehouse = this.repository.createWarehouse(
        {
          name: input.name.trim(),
          address: normalizeText(input.address),
          managerId: input.managerId ?? null,
          status: input.status,
          notes: normalizeText(input.notes),
        },
        audit,
      );

      return successResult("تم إنشاء المستودع بنجاح.", warehouse);
    });
  }

  updateWarehouse(input: WarehouseUpdateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const current = requireWarehouse(this.repository, input.id);

      ensureWarehouseTransitionAllowed(
        this.repository,
        current.id,
        current.managerId,
        input.managerId,
        input.status,
      );

      if (input.managerId && input.managerId !== current.managerId) {
        requireActiveEmployee(
          requireEmployeeWithRoleKey(
            this.repository,
            input.managerId,
            SYSTEM_ROLE_KEYS.warehouseManager,
            "managerId",
          ),
          "managerId",
        );
      }

      const warehouse = this.repository.updateWarehouse(
        {
          id: input.id,
          name: input.name?.trim(),
          address: input.address !== undefined ? normalizeText(input.address) : undefined,
          managerId: input.managerId,
          status: input.status,
          notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
        },
        audit,
      );

      return successResult("تم تحديث المستودع بنجاح.", warehouse!);
    });
  }

  // ---------------------------------------------------------------------------
  // Project assignments
  // ---------------------------------------------------------------------------

  listProjectAssignments(filters?: ProjectAssignmentListFilters) {
    return { items: this.repository.listProjectAssignments(filters) };
  }

  getProjectAssignment(id: string) {
    const assignment = this.repository.getProjectAssignmentById(id);
    if (!assignment) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المشروع.");
    }

    return successResult("تم تحميل ربط المشروع بنجاح.", assignment);
  }

  createProjectAssignment(
    input: ProjectAssignmentCreateInput,
    auditContext?: MutationAuditContext,
  ) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const employee = this.repository.getEmployeeById(input.employeeId);
      if (!employee) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
      }
      const employeeRole = this.repository.getRoleById(employee.roleId);
      if (!employeeRole) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على دور العامل.");
      }
      const project = requireProject(this.repository, input.projectId);

      if (input.status === "ACTIVE") {
        requireActiveEmployee(employee, "employeeId");

        if (
          employeeRole.key !== SYSTEM_ROLE_KEYS.worker &&
          employeeRole.key !== SYSTEM_ROLE_KEYS.projectManager &&
          employeeRole.key !== SYSTEM_ROLE_KEYS.warehouseManager
        ) {
          throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط هذا الدور بموقع عمل نشط.", [
            { field: "employeeId", message: "لا يمكن ربط هذا الدور بموقع عمل نشط." },
          ]);
        }

        if (project.status !== "ACTIVE") {
          throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط عامل نشط إلا بمشروع نشط.", [
            { field: "projectId", message: "لا يمكن ربط عامل نشط إلا بمشروع نشط." },
          ]);
        }
        if (this.repository.getActiveProjectAssignmentByEmployeeId(input.employeeId)) {
          throw new CompanyError(
            "CONFLICT",
            "هذا العامل مرتبط بالفعل بمشروع نشط.",
            [{ field: "employeeId", message: "هذا العامل مرتبط بالفعل بمشروع نشط." }],
          );
        }
        if (this.repository.getActiveWarehouseAssignmentByEmployeeId(input.employeeId)) {
          throw new CompanyError(
            "CONFLICT",
            "هذا العامل مرتبط بالفعل بموقع عمل نشط داخل مستودع.",
            [{ field: "employeeId", message: "هذا العامل مرتبط بالفعل بموقع عمل نشط داخل مستودع." }],
          );
        }

        const activeManagerAssignment = this.repository.getActiveManagerAssignmentByWorkerId(
          input.employeeId,
        );
        if (!activeManagerAssignment) {
          throw new CompanyError(
            "BUSINESS_RULE",
            "يجب ربط العامل بمدير نشط قبل تعيينه إلى مشروع نشط.",
          );
        }

        if (!project.managerId || project.managerId !== activeManagerAssignment.managerId) {
          throw new CompanyError(
            "BUSINESS_RULE",
            "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.",
            [{ field: "projectId", message: "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل." }],
          );
        }
      }

      const assignment = this.repository.createProjectAssignment(
        {
          employeeId: input.employeeId,
          projectId: input.projectId,
          status: input.status,
          startDate: normalizeAlgeriaTimestamp(input.startDate),
          endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
          notes: normalizeText(input.notes),
        },
        audit,
      );

      return successResult("تم إنشاء ربط المشروع بنجاح.", assignment);
    });
  }

  endProjectAssignment(input: ProjectAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const current = this.repository.getProjectAssignmentById(input.id);
      if (!current) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المشروع.");
      }

      if (current.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المشاريع النشطة فقط.");
      }

      const assignment = this.repository.endProjectAssignment(
        {
          id: input.id,
          endDate: normalizeAlgeriaTimestamp(input.endDate),
          notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
        },
        audit,
      );

      return successResult("تم إنهاء ربط المشروع بنجاح.", assignment!);
    });
  }

  // ---------------------------------------------------------------------------
  // Warehouse assignments
  // ---------------------------------------------------------------------------

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters) {
    return { items: this.repository.listWarehouseAssignments(filters) };
  }

  getWarehouseAssignment(id: string) {
    const assignment = this.repository.getWarehouseAssignmentById(id);
    if (!assignment) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المستودع.");
    }

    return successResult("تم تحميل ربط المستودع بنجاح.", assignment);
  }

  createWarehouseAssignment(
    input: WarehouseAssignmentCreateInput,
    auditContext?: MutationAuditContext,
  ) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const employee = this.repository.getEmployeeById(input.employeeId);
      if (!employee) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
      }
      const employeeRole = this.repository.getRoleById(employee.roleId);
      if (!employeeRole) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على دور العامل.");
      }
      const warehouse = requireWarehouse(this.repository, input.warehouseId);

      if (input.status === "ACTIVE") {
        requireActiveEmployee(employee, "employeeId");

        if (
          employeeRole.key !== SYSTEM_ROLE_KEYS.worker &&
          employeeRole.key !== SYSTEM_ROLE_KEYS.projectManager &&
          employeeRole.key !== SYSTEM_ROLE_KEYS.warehouseManager
        ) {
          throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط هذا الدور بموقع عمل نشط.", [
            { field: "employeeId", message: "لا يمكن ربط هذا الدور بموقع عمل نشط." },
          ]);
        }

        if (warehouse.status !== "ACTIVE") {
          throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط عامل نشط إلا بمستودع نشط.", [
            { field: "warehouseId", message: "لا يمكن ربط عامل نشط إلا بمستودع نشط." },
          ]);
        }
        if (this.repository.getActiveProjectAssignmentByEmployeeId(input.employeeId)) {
          throw new CompanyError(
            "CONFLICT",
            "هذا العامل مرتبط بالفعل بموقع عمل نشط داخل مشروع.",
            [{ field: "employeeId", message: "هذا العامل مرتبط بالفعل بموقع عمل نشط داخل مشروع." }],
          );
        }
        if (this.repository.getActiveWarehouseAssignmentByEmployeeId(input.employeeId)) {
          throw new CompanyError(
            "CONFLICT",
            "هذا العامل مرتبط بالفعل بمستودع نشط.",
            [{ field: "employeeId", message: "هذا العامل مرتبط بالفعل بمستودع نشط." }],
          );
        }
        if (this.repository.getActiveManagerAssignmentByWorkerId(input.employeeId)) {
          throw new CompanyError(
            "BUSINESS_RULE",
            "يجب إنهاء ربط المدير النشط للعامل قبل نقله إلى مستودع.",
            [{ field: "employeeId", message: "يجب إنهاء ربط المدير النشط للعامل قبل نقله إلى مستودع." }],
          );
        }
      }

      const assignment = this.repository.createWarehouseAssignment(
        {
          employeeId: input.employeeId,
          warehouseId: input.warehouseId,
          status: input.status,
          startDate: normalizeAlgeriaTimestamp(input.startDate),
          endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
          notes: normalizeText(input.notes),
        },
        audit,
      );

      return successResult("تم إنشاء ربط المستودع بنجاح.", assignment);
    });
  }

  endWarehouseAssignment(input: WarehouseAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const current = this.repository.getWarehouseAssignmentById(input.id);
      if (!current) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المستودع.");
      }

      if (current.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المستودعات النشطة فقط.");
      }

      const assignment = this.repository.endWarehouseAssignment(
        {
          id: input.id,
          endDate: normalizeAlgeriaTimestamp(input.endDate),
          notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
        },
        audit,
      );

      return successResult("تم إنهاء ربط المستودع بنجاح.", assignment!);
    });
  }
}
