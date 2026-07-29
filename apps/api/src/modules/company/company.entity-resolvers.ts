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
import { SYSTEM_ROLE_KEYS } from "./company.types";
import type { CompanyRepository } from "./company.repository.contracts";
import type { WorkforceRepository } from "./workforce.repository";
import type { OperationsRepository } from "./operations.repository";
import type { FinanceRepository } from "./finance.repository";

export function requireRole(repository: WorkforceRepository, roleId: string) {
  const role = repository.getRoleById(roleId);
  if (!role) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على الدور المطلوب.", [
      { field: "roleId", message: "تعذر العثور على الدور المطلوب." },
    ]);
  }

  return role;
}

export function requireAssignableEmployeeRole(
  repository: WorkforceRepository,
  roleId: string,
  field: string,
) {
  const role = requireRole(repository, roleId);

  if (
    !role.isSystem ||
    !Object.values(SYSTEM_ROLE_KEYS).includes(
      role.key as (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS],
    )
  ) {
    throw new CompanyError("BUSINESS_RULE", "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة.", [
      { field, message: "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة." },
    ]);
  }

  return role;
}

export function requireEmployee(repository: WorkforceRepository, employeeId: string) {
  const employee = repository.getEmployeeById(employeeId);
  if (!employee) {
    throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
  }

  return employee;
}

export function requireEmployeeWithRoleKey(
  repository: WorkforceRepository,
  employeeId: string,
  roleKey: string,
  field: string,
) {
  const employee = requireEmployee(repository, employeeId);
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
  return requireEmployeeWithRoleKey(repository, id, SYSTEM_ROLE_KEYS.worker, field);
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

export function ensureEmployeeTransitionAllowed(
  repository: CompanyRepository,
  employee: { id: string },
  currentRoleKey: string,
  nextRoleKey: string,
  nextStatus: string,
) {
  const hasActiveManagerAssignment = Boolean(
    repository.getActiveManagerAssignmentByWorkerId(employee.id),
  );
  const hasActiveProjectAssignment = Boolean(
    repository.getActiveProjectAssignmentByEmployeeId(employee.id),
  );
  const hasActiveWarehouseAssignment = Boolean(
    repository.getActiveWarehouseAssignmentByEmployeeId(employee.id),
  );

  if (
    currentRoleKey === SYSTEM_ROLE_KEYS.worker &&
    (nextRoleKey !== SYSTEM_ROLE_KEYS.worker || nextStatus !== "ACTIVE") &&
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
    currentRoleKey === SYSTEM_ROLE_KEYS.projectManager &&
    (nextRoleKey !== SYSTEM_ROLE_KEYS.projectManager || nextStatus !== "ACTIVE")
  ) {
    const hasActiveManagedProjects =
      repository.listProjects({ managerId: employee.id, status: "ACTIVE" }).length > 0;
    const hasActiveWorkers =
      repository.listManagerAssignments({ managerId: employee.id, status: "ACTIVE" }).length > 0;

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
    currentRoleKey === SYSTEM_ROLE_KEYS.warehouseManager &&
    (nextRoleKey !== SYSTEM_ROLE_KEYS.warehouseManager || nextStatus !== "ACTIVE")
  ) {
    const hasActiveWarehouses =
      repository.listWarehouses({ managerId: employee.id, status: "ACTIVE" }).length > 0;

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
}

export function ensureProjectTransitionAllowed(
  repository: CompanyRepository,
  projectId: string,
  currentManagerId: string | null,
  nextManagerId: string | null | undefined,
  nextStatus: string | undefined,
) {
  const activeAssignments = repository.listProjectAssignments({
    projectId,
    status: "ACTIVE",
  });

  if (activeAssignments.length === 0) {
    return;
  }

  const activeWorkerAssignments = activeAssignments.filter((assignment) => {
    const employee = repository.getEmployeeById(assignment.employeeId);
    if (!employee) {
      return false;
    }

    return repository.getRoleById(employee.roleId)?.key === SYSTEM_ROLE_KEYS.worker;
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
  repository: CompanyRepository,
  warehouseId: string,
  currentManagerId: string | null,
  nextManagerId: string | null | undefined,
  nextStatus: string | undefined,
) {
  const activeAssignments = repository.listWarehouseAssignments({
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
  repository: CompanyRepository,
  projectId: string,
  options?: { requireManagerConsistencyWith?: string | null },
) {
  return repository
    .listProjectAssignments({ projectId, status: "ACTIVE" })
    .filter((assignment) => {
      const employee = repository.getEmployeeById(assignment.employeeId);
      if (!employee) {
        return false;
      }

      const employeeRole = repository.getRoleById(employee.roleId);
      if (employeeRole?.key !== SYSTEM_ROLE_KEYS.worker) {
        return false;
      }

      if (options?.requireManagerConsistencyWith === undefined) {
        return true;
      }

      const activeManagerAssignment = repository.getActiveManagerAssignmentByWorkerId(
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
