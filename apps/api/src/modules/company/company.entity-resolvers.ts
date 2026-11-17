/**
 * Cross-domain entity resolvers.
 *
 * These helpers look up entities by id and throw the appropriate
 * `CompanyError` when the entity is missing or the lookup violates a
 * business invariant. They are intentionally pure functions over a
 * `CompanyRepository` so any domain service (workforce, operations,
 * finance) can use them without coupling to `CompanyService`.
 *
 * @see docs/slice-1-employee-deep-module.md for the deep-module
 *      pattern that motivates this split.
 */

import { CompanyError } from "./company.errors";
import type { WorkspaceAdminAuthorizer } from "./company.helpers";
import {
  ASSIGNABLE_ROLE_KEYS,
  isAcceptedEmployeeRoleKey,
  LEGACY_WORKFORCE_ROLE_KEYS,
  type EmployeeRecord,
  type EmployeeManagerAssignmentRecord,
  type RoleRecord,
} from "./company.types";
import type { WorkforceRepository } from "./workforce.repository";
import type { OperationsRepository } from "./operations.repository";
import type { FinanceRepository } from "./finance.repository";

export function requireRole(repository: Pick<WorkforceRepository, "getRoleById">, roleId: string) {
  const role = repository.getRoleById(roleId);
  if (!role) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على الدور المطلوب.", [
      { field: "roleId", message: "تعذر العثور على الدور المطلوب." },
    ]);
  }

  return role;
}

/**
 * Shared caller-facing message for the admin-role assignment privilege gate.
 * Kept in one place so the single create/update guard and the batch-create
 * field error cannot drift apart.
 */
export const ADMIN_ASSIGNMENT_UNAUTHORIZED_MESSAGE =
  "تخصيص دور الإدارة متاح فقط لحساب الإدارة الرئيسي.";

/**
 * Admin-role assignment privilege gate (Greptile P1 fix, tracked via #340).
 *
 * Assigning the `admin` role to an employee mints a record that, once
 * permission resolution links users to employees by phone, grants the
 * matching account every admin permission. Only a caller that already holds
 * the admin-level grant — the bootstrap owner, per `WorkspaceAdminAuthorizer`
 * — may assign it. Any other caller (e.g. a `manager` holding
 * `employees:create`) is rejected with UNAUTHORIZED, closing the
 * privilege-escalation path where a lesser grant mints an admin.
 *
 * Fail-closed: when no authorizer is configured or the actor is unknown,
 * the caller's grant cannot be proven, so the admin assignment is rejected.
 * `manager` / `viewer` and the legacy workforce keys are unaffected.
 */
export function requireAdminAssignmentGrant(
  authorizer: WorkspaceAdminAuthorizer | undefined,
  actorUserId: string | null,
  roleKey: string,
  field: string,
): void {
  if (roleKey !== ASSIGNABLE_ROLE_KEYS.admin) {
    return;
  }

  const holdsAdminGrant =
    authorizer !== undefined &&
    actorUserId !== null &&
    authorizer.isBootstrapOwner(actorUserId);

  if (!holdsAdminGrant) {
    throw new CompanyError("UNAUTHORIZED", ADMIN_ASSIGNMENT_UNAUTHORIZED_MESSAGE, [
      { field, message: ADMIN_ASSIGNMENT_UNAUTHORIZED_MESSAGE },
    ]);
  }
}

export function requireAssignableEmployeeRole(
  repository: Pick<WorkforceRepository, "getRoleById">,
  roleId: string,
  field: string,
  caller?: { authorizer: WorkspaceAdminAuthorizer | undefined; actorUserId: string | null },
) {
  const role = requireRole(repository, roleId);

  if (!role.isSystem || !isAcceptedEmployeeRoleKey(role.key)) {
    throw new CompanyError("BUSINESS_RULE", "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة.", [
      { field, message: "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة." },
    ]);
  }

  requireAdminAssignmentGrant(caller?.authorizer, caller?.actorUserId ?? null, role.key, field);

  return role;
}

export function requireEmployee(repository: WorkforceRepository, employeeId: string) {
  const employee = repository.getEmployeeById(employeeId);
  if (!employee) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
  }

  return employee;
}

export type OperationsWorkforceReader = {
  getEmployeeById(id: string): Pick<EmployeeRecord, "id" | "roleId" | "status"> | null;
  getRoleById(id: string): RoleRecord | null;
  getActiveManagerAssignmentByWorkerId(id: string): EmployeeManagerAssignmentRecord | null;
};

export function requireEmployeeWithRoleKey<T extends Pick<EmployeeRecord, "id" | "roleId" | "status">>(
  repository: { getEmployeeById(id: string): T | null; getRoleById(id: string): RoleRecord | null },
  employeeId: string,
  roleKey: string,
  field: string,
): T {
  const employee = repository.getEmployeeById(employeeId);
  if (!employee) throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
  const role = requireRole(repository, employee.roleId);

  if (role.key !== roleKey) {
    throw new CompanyError("BUSINESS_RULE", `العامل لا يملك الدور المطلوب: ${roleKey}.`, [
      { field, message: `العامل لا يملك الدور المطلوب: ${roleKey}.` },
    ]);
  }

  return employee;
}

export function requireActiveEmployee<T extends { status: string }>(employee: T, field: string): T {
  if (employee.status !== "ACTIVE") {
    throw new CompanyError("BUSINESS_RULE", "يجب أن يكون العامل بحالة نشطة لإتمام هذه العملية.", [
      { field, message: "يجب أن يكون العامل بحالة نشطة لإتمام هذه العملية." },
    ]);
  }

  return employee;
}

export function requireEmployeeWorker(repository: WorkforceRepository, id: string, field: string) {
  return requireEmployeeWithRoleKey(repository, id, LEGACY_WORKFORCE_ROLE_KEYS.worker, field);
}

export function requireProject(repository: OperationsRepository, projectId: string) {
  const project = repository.getProjectById(projectId);
  if (!project) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.");
  }

  return project;
}

export function requireWarehouse(repository: OperationsRepository, warehouseId: string) {
  const warehouse = repository.getWarehouseById(warehouseId);
  if (!warehouse) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على المستودع المطلوب.");
  }

  return warehouse;
}

export function requireDebtAccount(repository: FinanceRepository, id: string) {
  const account = repository.getDebtAccountById(id);
  if (!account) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على حساب الدين المطلوب.");
  }

  return account;
}

export function requireExternalCounterparty(
  repository: FinanceRepository,
  id: string,
  field = "id",
) {
  const counterparty = repository.getExternalCounterpartyById(id);
  if (!counterparty) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على الطرف الخارجي المطلوب.", [
      { field, message: "تعذر العثور على الطرف الخارجي المطلوب." },
    ]);
  }

  return counterparty;
}

export type EmployeeTransitionLinks = {
  hasActiveManagerAssignment: boolean;
  hasActiveProjectAssignment: boolean;
  hasActiveWarehouseAssignment: boolean;
  hasActiveManagedProjects: boolean;
  hasActiveWorkers: boolean;
  hasActiveManagedWarehouses: boolean;
};

export function ensureEmployeeTransitionAllowed(
  workforceRepo: WorkforceRepository,
  operationsRepo: OperationsRepository,
  employee: { id: string },
  currentRoleKey: string,
  nextRoleKey: string,
  nextStatus: string,
) {
  const leavingProjectManager = currentRoleKey === LEGACY_WORKFORCE_ROLE_KEYS.projectManager
    && (nextRoleKey !== currentRoleKey || nextStatus !== "ACTIVE");
  const leavingWarehouseManager = currentRoleKey === LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager
    && (nextRoleKey !== currentRoleKey || nextStatus !== "ACTIVE");
  return assertEmployeeTransitionAllowed(currentRoleKey, nextRoleKey, nextStatus, {
    hasActiveManagerAssignment: Boolean(workforceRepo.getActiveManagerAssignmentByWorkerId(employee.id)),
    hasActiveProjectAssignment: Boolean(operationsRepo.getActiveProjectAssignmentByEmployeeId(employee.id)),
    hasActiveWarehouseAssignment: Boolean(operationsRepo.getActiveWarehouseAssignmentByEmployeeId(employee.id)),
    hasActiveManagedProjects: leavingProjectManager && operationsRepo.listProjects({ managerId: employee.id, status: "ACTIVE" }).length > 0,
    hasActiveWorkers: leavingProjectManager && workforceRepo.listManagerAssignments({ managerId: employee.id, status: "ACTIVE" }).length > 0,
    hasActiveManagedWarehouses: leavingWarehouseManager && operationsRepo.listWarehouses({ managerId: employee.id, status: "ACTIVE" }).length > 0,
  });
}

/** One metadata-only policy for legacy and exact employee storage. */
export function assertEmployeeTransitionAllowed(currentRoleKey: string, nextRoleKey: string, nextStatus: string, links: EmployeeTransitionLinks) {
  const { hasActiveManagerAssignment, hasActiveProjectAssignment, hasActiveWarehouseAssignment } = links;

  if (
    currentRoleKey === LEGACY_WORKFORCE_ROLE_KEYS.worker &&
    (nextRoleKey !== LEGACY_WORKFORCE_ROLE_KEYS.worker || nextStatus !== "ACTIVE") &&
    (hasActiveManagerAssignment || hasActiveProjectAssignment || hasActiveWarehouseAssignment)
  ) {
    throw new CompanyError(
      "BUSINESS_RULE",
      "لا يمكن تغيير دور العامل أو حالته مع وجود روابط عمل نشطة.",
      [
        {
          field: "status",
          message: "لا يمكن تغيير دور العامل أو حالته مع وجود روابط عمل نشطة.",
        },
      ],
    );
  }

  if (
    currentRoleKey === LEGACY_WORKFORCE_ROLE_KEYS.projectManager &&
    (nextRoleKey !== LEGACY_WORKFORCE_ROLE_KEYS.projectManager || nextStatus !== "ACTIVE")
  ) {
    const { hasActiveManagedProjects, hasActiveWorkers } = links;

    if (
      hasActiveManagedProjects ||
      hasActiveWorkers ||
      hasActiveProjectAssignment ||
      hasActiveWarehouseAssignment
    ) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين أو يرتبط بموقع عمل نشط.",
        [
          {
            field: "status",
            message:
              "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين أو يرتبط بموقع عمل نشط.",
          },
        ],
      );
    }
  }

  if (
    currentRoleKey === LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager &&
    (nextRoleKey !== LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager || nextStatus !== "ACTIVE")
  ) {
    const hasActiveWarehouses = links.hasActiveManagedWarehouses;

    if (hasActiveWarehouses || hasActiveProjectAssignment || hasActiveWarehouseAssignment) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "لا يمكن تغيير حالة مدير المخزن أو دوره ما دام يدير مستودعات نشطة أو يرتبط بموقع عمل نشط.",
        [
          {
            field: "status",
            message:
              "لا يمكن تغيير حالة مدير المخزن أو دوره ما دام يدير مستودعات نشطة أو يرتبط بموقع عمل نشط.",
          },
        ],
      );
    }
  }

  if (
    currentRoleKey !== LEGACY_WORKFORCE_ROLE_KEYS.worker &&
    nextRoleKey === LEGACY_WORKFORCE_ROLE_KEYS.worker &&
    nextStatus === "ACTIVE"
  ) {
    const message = "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط.";
    throw new CompanyError("BUSINESS_RULE", message, [{ field: "roleId", message }]);
  }
}

export function ensureProjectTransitionAllowed(
  operationsRepo: OperationsRepository,
  workforceRepo: OperationsWorkforceReader,
  projectId: string,
  currentManagerId: string | null,
  nextManagerId: string | null | undefined,
  nextStatus: string | undefined,
) {
  const activeAssignments = operationsRepo.listProjectAssignments({
    projectId,
    status: "ACTIVE",
  });

  if (activeAssignments.length === 0) {
    return;
  }

  const activeWorkerAssignments = activeAssignments.filter((assignment) => {
    const employee = workforceRepo.getEmployeeById(assignment.employeeId);
    if (!employee) {
      return false;
    }

    return workforceRepo.getRoleById(employee.roleId)?.key === LEGACY_WORKFORCE_ROLE_KEYS.worker;
  });

  const managerWillChange = nextManagerId !== undefined && nextManagerId !== currentManagerId;
  const projectWillDeactivate = nextStatus !== undefined && nextStatus !== "ACTIVE";

  if (projectWillDeactivate) {
    throw new CompanyError(
      "BUSINESS_RULE",
      "لا يمكن تعديل مدير المشروع أو حالته مع وجود عمال مرتبطين بمشروع نشط.",
      [
        {
          field: "status",
          message: "لا يمكن تعديل مدير المشروع أو حالته مع وجود عمال مرتبطين بمشروع نشط.",
        },
      ],
    );
  }

  if (managerWillChange && nextManagerId === null && activeWorkerAssignments.length > 0) {
    throw new CompanyError(
      "BUSINESS_RULE",
      "لا يمكن إزالة مدير المشروع ما دام هناك عمال نشطون مرتبطون بهذا المشروع.",
      [
        {
          field: "managerId",
          message: "لا يمكن إزالة مدير المشروع ما دام هناك عمال نشطون مرتبطون بهذا المشروع.",
        },
      ],
    );
  }
}

export function ensureWarehouseTransitionAllowed(
  operationsRepo: OperationsRepository,
  warehouseId: string,
  currentManagerId: string | null,
  nextManagerId: string | null | undefined,
  nextStatus: string | undefined,
) {
  const activeAssignments = operationsRepo.listWarehouseAssignments({
    warehouseId,
    status: "ACTIVE",
  });

  const managerWillChange = nextManagerId !== undefined && nextManagerId !== currentManagerId;
  const warehouseWillDeactivate = nextStatus !== undefined && nextStatus !== "ACTIVE";

  if (activeAssignments.length === 0 && !(warehouseWillDeactivate && currentManagerId !== null)) {
    return;
  }

  if (warehouseWillDeactivate && (activeAssignments.length > 0 || currentManagerId !== null)) {
    throw new CompanyError(
      "BUSINESS_RULE",
      "لا يمكن أرشفة المستودع أو تعطيله قبل إنهاء ارتباط المدير الحالي والعاملين النشطين به.",
      [
        {
          field: "status",
          message:
            "لا يمكن أرشفة المستودع أو تعطيله قبل إنهاء ارتباط المدير الحالي والعاملين النشطين به.",
        },
      ],
    );
  }

  if (managerWillChange && activeAssignments.length > 0) {
    throw new CompanyError(
      "BUSINESS_RULE",
      "لا يمكن تعديل مدير المستودع أو حالته مع وجود عاملين مرتبطين بمستودع نشط.",
      [
        {
          field: "managerId",
          message: "لا يمكن تعديل مدير المستودع أو حالته مع وجود عاملين مرتبطين بمستودع نشط.",
        },
      ],
    );
  }
}

export function listActiveWorkerIdsForProject(
  operationsRepo: OperationsRepository,
  workforceRepo: OperationsWorkforceReader,
  projectId: string,
  options?: { requireManagerConsistencyWith?: string | null },
) {
  return operationsRepo
    .listProjectAssignments({ projectId, status: "ACTIVE" })
    .filter((assignment) => {
      const employee = workforceRepo.getEmployeeById(assignment.employeeId);
      if (!employee) {
        return false;
      }

      const employeeRole = workforceRepo.getRoleById(employee.roleId);
      if (employeeRole?.key !== LEGACY_WORKFORCE_ROLE_KEYS.worker) {
        return false;
      }

      if (options?.requireManagerConsistencyWith === undefined) {
        return true;
      }

      const activeManagerAssignment = workforceRepo.getActiveManagerAssignmentByWorkerId(
        assignment.employeeId,
      );
      if (
        !activeManagerAssignment ||
        activeManagerAssignment.managerId !== options.requireManagerConsistencyWith
      ) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تغيير مدير المشروع لأن روابط المدير الحالية للعمال غير متطابقة مع هذا المشروع. أصلح الربط الحالي أولًا.",
          [
            {
              field: "managerId",
              message:
                "لا يمكن تغيير مدير المشروع لأن روابط المدير الحالية للعمال غير متطابقة مع هذا المشروع. أصلح الربط الحالي أولًا.",
            },
          ],
        );
      }

      return true;
    })
    .map((assignment) => assignment.employeeId);
}
