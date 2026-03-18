import {
  type EmployeeBatchCreateInput,
  type EmployeeAssignWorkplaceInput,
  type EmployeeCreateInput,
  type EmployeeSyncManagedProjectsInput,
  type EmployeeSyncManagedWarehousesInput,
  type EmployeeSalaryPaymentCreateInput,
  type EmployeeUpdateInput,
  type ManagerAssignmentCreateInput,
  type ManagerAssignmentEndInput,
  type ProjectAssignmentCreateInput,
  type ProjectAssignmentEndInput,
  type WarehouseAssignmentCreateInput,
  type WarehouseAssignmentEndInput,
  type ProjectCreateInput,
  type ProjectUpdateInput,
  type RoleCreateInput,
  type RoleUpdateInput,
  type WarehouseCreateInput,
  type WarehouseUpdateInput,
} from "@tuari/contracts";

import { CompanyError } from "./company.errors";
import type { CompanyRepository } from "./company.repository";
import {
  SYSTEM_ROLE_KEYS,
  type EmployeeSalaryPaymentListFilters,
  type EmployeeStateHistoryListFilters,
  type EmployeeListFilters,
  type ManagerAssignmentListFilters,
  type ProjectManagerOwnershipHistoryListFilters,
  type ProjectAssignmentListFilters,
  type ProjectListFilters,
  type MutationAuditContext,
  type SystemLogEntryRecord,
  type SystemLogListFilters,
  type WarehouseAssignmentListFilters,
  type WarehouseManagerOwnershipHistoryListFilters,
  type WarehouseListFilters,
} from "./company.types";

function successResult<T>(message: string, item: T) {
  return {
    success: true as const,
    message,
    item,
  };
}

function deleteResult(message: string) {
  return {
    success: true as const,
    message,
  };
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createAlgeriaTimestamp(date = new Date()) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().replace("Z", "+01:00")
}

function normalizeTimestamp(value: string | undefined) {
  return value ?? createAlgeriaTimestamp();
}

function buildBatchField(index: number, field: string) {
  return `employees.${index}.${field}`;
}

function normalizeSalaryAmount(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function normalizeMutationAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
  return {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
}

function getArabicStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "نشط"
    case "INACTIVE":
      return "غير نشط"
    case "LEFT":
      return "غادر"
    case "STOPPED":
      return "متوقف"
    case "COMPLETED":
      return "مكتمل"
    case "ARCHIVED":
      return "مؤرشف"
    case "ENDED":
      return "منتهي"
    default:
      return status
  }
}

function compareTimestampsDesc(left: string, right: string) {
  return new Date(right).getTime() - new Date(left).getTime()
}

export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  listRoles() {
    return { items: this.repository.listRoles() };
  }

  getRole(id: string) {
    const role = this.repository.getRoleById(id);
    if (!role) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الدور المطلوب.");
    }

    return successResult("تم تحميل الدور بنجاح.", role);
  }

  createRole(input: RoleCreateInput): never {
    void input
    throw new CompanyError("BUSINESS_RULE", "إدارة الأدوار المخصصة غير متاحة في هذه المرحلة.")
  }

  updateRole(input: RoleUpdateInput): never {
    void input
    throw new CompanyError("BUSINESS_RULE", "إدارة الأدوار المخصصة غير متاحة في هذه المرحلة.")
  }

  deleteRole(id: string): never {
    void id
    throw new CompanyError("BUSINESS_RULE", "إدارة الأدوار المخصصة غير متاحة في هذه المرحلة.")
  }

  listEmployees(filters?: EmployeeListFilters) {
    return { items: this.repository.listEmployees(filters) };
  }

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters) {
    return { items: this.repository.listEmployeeStateHistory(filters) }
  }

  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters) {
    return { items: this.repository.listProjectManagerOwnershipHistory(filters) }
  }

  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters) {
    return { items: this.repository.listWarehouseManagerOwnershipHistory(filters) }
  }

  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters) {
    return { items: this.repository.listSalaryPayments(filters) }
  }

  listSystemLog(filters?: SystemLogListFilters) {
    const rolesById = new Map(this.repository.listRoles().map((role) => [role.id, role]))
    const employeesById = new Map(this.repository.listEmployees().map((employee) => [employee.id, employee]))
    const projectsById = new Map(this.repository.listProjects().map((project) => [project.id, project]))
    const warehousesById = new Map(this.repository.listWarehouses().map((warehouse) => [warehouse.id, warehouse]))
    const actorLabelCache = new Map<string, string | null>()

    const resolveActorLabel = (actorUserId: string | null) => {
      if (!actorUserId) {
        return null
      }

      if (actorLabelCache.has(actorUserId)) {
        return actorLabelCache.get(actorUserId) ?? null
      }

      const authUser = this.repository.getAuthUserById(actorUserId)
      const actorLabel = authUser?.name ?? actorUserId

      actorLabelCache.set(actorUserId, actorLabel ?? null)
      return actorLabel ?? null
    }

    const logEvents: Array<SystemLogEntryRecord> = []

    for (const entry of this.repository.listEmployeeStateHistory()) {
      const employee = employeesById.get(entry.employeeId)
      const role = rolesById.get(entry.roleId)
      logEvents.push({
        id: `employee-state-${entry.id}`,
        transactionId: entry.transactionId,
        actorUserId: entry.actorUserId,
        actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
        actionType: entry.eventType === "CREATED" ? "EMPLOYEE_CREATED" : "EMPLOYEE_UPDATED",
        entityType: "EMPLOYEE",
        entityId: entry.employeeId,
        entityLabel: employee ? `${employee.firstName} ${employee.lastName}` : null,
        summary:
          entry.eventType === "CREATED"
            ? `تم إنشاء العامل ${employee ? `${employee.firstName} ${employee.lastName}` : entry.employeeId}`
            : `تم تحديث بيانات العامل ${employee ? `${employee.firstName} ${employee.lastName}` : entry.employeeId}`,
        detail: `${role?.name ?? "دور غير معروف"} - ${getArabicStatusLabel(entry.status)}`,
        createdAt: entry.updatedAt,
      })
    }

    for (const assignment of this.repository.listManagerAssignments()) {
      const worker = employeesById.get(assignment.workerId)
      const manager = employeesById.get(assignment.managerId)
      const verb = assignment.status === "ACTIVE" ? "تم ربط" : "تم إنهاء ربط"
      logEvents.push({
        id: `manager-assignment-${assignment.id}`,
        transactionId: assignment.transactionId,
        actorUserId: assignment.actorUserId,
        actorLabel: assignment.actorLabel ?? resolveActorLabel(assignment.actorUserId),
        actionType: "WORKPLACE_ASSIGNED",
        entityType: "MANAGER_ASSIGNMENT",
        entityId: assignment.id,
        entityLabel: worker ? `${worker.firstName} ${worker.lastName}` : null,
        summary: `${verb} العامل ${worker ? `${worker.firstName} ${worker.lastName}` : assignment.workerId} بالمدير ${manager ? `${manager.firstName} ${manager.lastName}` : assignment.managerId}`,
        detail: assignment.notes,
        createdAt: assignment.updatedAt,
      })
    }

    for (const assignment of this.repository.listProjectAssignments()) {
      const employee = employeesById.get(assignment.employeeId)
      const project = projectsById.get(assignment.projectId)
      const verb = assignment.status === "ACTIVE" ? "تم إسناد" : "تم إنهاء إسناد"
      logEvents.push({
        id: `project-assignment-${assignment.id}`,
        transactionId: assignment.transactionId,
        actorUserId: assignment.actorUserId,
        actorLabel: assignment.actorLabel ?? resolveActorLabel(assignment.actorUserId),
        actionType: "WORKPLACE_ASSIGNED",
        entityType: "PROJECT_ASSIGNMENT",
        entityId: assignment.id,
        entityLabel: project?.name ?? null,
        summary: `${verb} ${employee ? `${employee.firstName} ${employee.lastName}` : assignment.employeeId} إلى المشروع ${project?.name ?? assignment.projectId}`,
        detail: assignment.notes,
        createdAt: assignment.updatedAt,
      })
    }

    for (const assignment of this.repository.listWarehouseAssignments()) {
      const employee = employeesById.get(assignment.employeeId)
      const warehouse = warehousesById.get(assignment.warehouseId)
      const verb = assignment.status === "ACTIVE" ? "تم إسناد" : "تم إنهاء إسناد"
      logEvents.push({
        id: `warehouse-assignment-${assignment.id}`,
        transactionId: assignment.transactionId,
        actorUserId: assignment.actorUserId,
        actorLabel: assignment.actorLabel ?? resolveActorLabel(assignment.actorUserId),
        actionType: "WORKPLACE_ASSIGNED",
        entityType: "WAREHOUSE_ASSIGNMENT",
        entityId: assignment.id,
        entityLabel: warehouse?.name ?? null,
        summary: `${verb} ${employee ? `${employee.firstName} ${employee.lastName}` : assignment.employeeId} إلى المستودع ${warehouse?.name ?? assignment.warehouseId}`,
        detail: assignment.notes,
        createdAt: assignment.updatedAt,
      })
    }

    for (const entry of this.repository.listProjectManagerOwnershipHistory()) {
      const project = projectsById.get(entry.projectId)
      const manager = employeesById.get(entry.managerId)
      const verb = entry.status === "ACTIVE" ? "تم تعيين" : "تم إنهاء تعيين"
      logEvents.push({
        id: `project-manager-history-${entry.id}`,
        transactionId: entry.transactionId,
        actorUserId: entry.actorUserId,
        actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
        actionType: "PROJECT_MANAGER_CHANGED",
        entityType: "PROJECT",
        entityId: entry.projectId,
        entityLabel: project?.name ?? null,
        summary: `${verb} ${manager ? `${manager.firstName} ${manager.lastName}` : entry.managerId} مديرًا للمشروع ${project?.name ?? entry.projectId}`,
        detail: entry.notes,
        createdAt: entry.updatedAt,
      })
    }

    for (const entry of this.repository.listWarehouseManagerOwnershipHistory()) {
      const warehouse = warehousesById.get(entry.warehouseId)
      const manager = employeesById.get(entry.managerId)
      const verb = entry.status === "ACTIVE" ? "تم تعيين" : "تم إنهاء تعيين"
      logEvents.push({
        id: `warehouse-manager-history-${entry.id}`,
        transactionId: entry.transactionId,
        actorUserId: entry.actorUserId,
        actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
        actionType: "WAREHOUSE_MANAGER_CHANGED",
        entityType: "WAREHOUSE",
        entityId: entry.warehouseId,
        entityLabel: warehouse?.name ?? null,
        summary: `${verb} ${manager ? `${manager.firstName} ${manager.lastName}` : entry.managerId} مديرًا للمستودع ${warehouse?.name ?? entry.warehouseId}`,
        detail: entry.notes,
        createdAt: entry.updatedAt,
      })
    }

    for (const payment of this.repository.listSalaryPayments()) {
      const employee = employeesById.get(payment.employeeId)
      logEvents.push({
        id: `salary-payment-${payment.id}`,
        transactionId: payment.transactionId,
        actorUserId: payment.actorUserId,
        actorLabel: payment.actorLabel ?? resolveActorLabel(payment.actorUserId),
        actionType: "SALARY_PAYMENT_RECORDED",
        entityType: "SALARY_PAYMENT",
        entityId: payment.id,
        entityLabel: employee ? `${employee.firstName} ${employee.lastName}` : null,
        summary: `تم تسجيل دفعة راتب للعامل ${employee ? `${employee.firstName} ${employee.lastName}` : payment.employeeId}`,
        detail: `المبلغ المدفوع ${payment.actualAmountDzd} دج`,
        createdAt: payment.updatedAt,
      })
    }

    for (const entry of this.repository.listUserProfileHistory()) {
      logEvents.push({
        id: `user-profile-${entry.id}`,
        transactionId: entry.transactionId,
        actorUserId: entry.actorUserId,
        actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
        actionType: "ACCOUNT_UPDATED",
        entityType: "ACCOUNT",
        entityId: entry.userId,
        entityLabel: entry.name ?? entry.phone ?? resolveActorLabel(entry.userId),
        summary: `تم تحديث بيانات الحساب ${entry.name ?? entry.phone ?? entry.userId}`,
        detail: [entry.name ? `الاسم: ${entry.name}` : null, entry.phone ? `الهاتف: ${entry.phone}` : null]
          .filter((value): value is string => Boolean(value))
          .join(" • ") || null,
        createdAt: entry.updatedAt,
      })
    }

    const groupedEntries = Array.from(
      logEvents.reduce<Map<string, { events: SystemLogEntryRecord[]; key: string }>>((groups, event) => {
        const key = event.transactionId ?? event.id
        const existing = groups.get(key)

        if (existing) {
          existing.events.push(event)
          return groups
        }

        groups.set(key, { events: [event], key })
        return groups
      }, new Map<string, { events: SystemLogEntryRecord[]; key: string }>()).values(),
    )
      .filter(({ events }) =>
        events.some((event) => {
          if (filters?.actionType && event.actionType !== filters.actionType) {
            return false
          }

          if (filters?.actorUserId && event.actorUserId !== filters.actorUserId) {
            return false
          }

          if (filters?.entityId && event.entityId !== filters.entityId) {
            return false
          }

          if (filters?.entityType && event.entityType !== filters.entityType) {
            return false
          }

          if (filters?.fromDate && event.createdAt < filters.fromDate) {
            return false
          }

          if (filters?.toDate && event.createdAt > filters.toDate) {
            return false
          }

          return true
        }),
      )
      .map(({ events, key }) => {
        const sortedEvents = [...events].sort((left, right) => compareTimestampsDesc(left.createdAt, right.createdAt))
        const primaryEvent = (
          sortedEvents.find((event) => event.actionType === "SALARY_PAYMENT_RECORDED") ??
          sortedEvents.find((event) => event.actionType === "PROJECT_MANAGER_CHANGED") ??
          sortedEvents.find((event) => event.actionType === "WAREHOUSE_MANAGER_CHANGED") ??
          sortedEvents[0]
        )!

        const detailLines = sortedEvents
          .flatMap((event) => [event.detail, event.summary !== primaryEvent.summary ? event.summary : null])
          .filter((value): value is string => Boolean(value && value.trim().length > 0))
          .filter((value, index, values) => values.indexOf(value) === index)

        return {
          id: key,
          transactionId: primaryEvent.transactionId,
          actorUserId: primaryEvent.actorUserId,
          actorLabel: primaryEvent.actorLabel,
          actionType: primaryEvent.actionType,
          entityType: primaryEvent.entityType,
          entityId: primaryEvent.entityId,
          entityLabel: primaryEvent.entityLabel,
          summary: primaryEvent.summary,
          detail: detailLines.length > 0 ? detailLines.join(" • ") : primaryEvent.detail,
          createdAt: sortedEvents[0]!.createdAt,
        } satisfies SystemLogEntryRecord
      })
      .sort((left, right) => compareTimestampsDesc(left.createdAt, right.createdAt))

    return { items: groupedEntries }
  }

  getEmployee(id: string) {
    const employee = this.requireEmployee(id);
    return successResult("تم تحميل العامل بنجاح.", employee);
  }

  createEmployee(input: EmployeeCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    this.requireAssignableEmployeeRole(input.roleId, "roleId");

    if ((input.salaryAmountDzd ?? null) !== null && !input.salaryPeriod) {
      throw new CompanyError("VALIDATION", "يجب اختيار دورية الأجر مع قيمة الأجر.", [
        { field: "salaryPeriod", message: "يجب اختيار دورية الأجر مع قيمة الأجر." },
      ])
    }

    if ((input.salaryAmountDzd ?? null) === null && input.salaryPeriod) {
      throw new CompanyError("VALIDATION", "يجب إدخال قيمة الأجر مع دورية الأجر.", [
        { field: "salaryAmountDzd", message: "يجب إدخال قيمة الأجر مع دورية الأجر." },
      ])
    }

    if (this.repository.getEmployeeByPhone(input.phone)) {
      throw new CompanyError("CONFLICT", "رقم هاتف العامل مستخدم بالفعل.", [
        { field: "phone", message: "رقم هاتف العامل مستخدم بالفعل." },
      ]);
    }

    const employee = this.repository.createEmployee({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      roleId: input.roleId,
      status: input.status,
      salaryAmountDzd: normalizeSalaryAmount(input.salaryAmountDzd),
      salaryPeriod: input.salaryPeriod ?? null,
      notes: normalizeText(input.notes),
    }, audit);

    return successResult("تم إنشاء العامل بنجاح.", employee);
  }

  createEmployeesBatch(input: EmployeeBatchCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const fieldErrors: Array<{ field: string; message: string }> = [];
    const seenPhones = new Set<string>();
    const normalizedEmployees: Array<{
      firstName: string;
      lastName: string;
      phone: string;
      roleId: string;
      status: EmployeeBatchCreateInput["employees"][number]["status"];
      salaryAmountDzd: number | null;
      salaryPeriod: EmployeeBatchCreateInput["employees"][number]["salaryPeriod"];
      notes: string | null;
      managerId: string | null;
      projectId: string | null;
    }> = input.employees.map((employee: EmployeeBatchCreateInput["employees"][number]) => ({
      firstName: employee.firstName.trim(),
      lastName: employee.lastName.trim(),
      phone: employee.phone.trim(),
      roleId: employee.roleId,
      status: employee.status,
      salaryAmountDzd: normalizeSalaryAmount(employee.salaryAmountDzd),
      salaryPeriod: employee.salaryPeriod ?? null,
      notes: normalizeText(employee.notes),
      managerId: employee.managerId ?? null,
      projectId: employee.projectId ?? null,
    }));

    normalizedEmployees.forEach((employee, index: number) => {
      const role = this.repository.getRoleById(employee.roleId);

      if (!role) {
        fieldErrors.push({
          field: buildBatchField(index, "roleId"),
          message: "تعذر العثور على الدور المطلوب.",
        });
      } else if (!role.isSystem || !Object.values(SYSTEM_ROLE_KEYS).includes(role.key as (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS])) {
        fieldErrors.push({
          field: buildBatchField(index, "roleId"),
          message: "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة.",
        });
      }

      if (seenPhones.has(employee.phone)) {
        fieldErrors.push({
          field: buildBatchField(index, "phone"),
          message: "تم تكرار رقم الهاتف داخل نفس الدفعة.",
        });
      } else {
        seenPhones.add(employee.phone);
      }

      if (this.repository.getEmployeeByPhone(employee.phone)) {
        fieldErrors.push({
          field: buildBatchField(index, "phone"),
          message: "رقم هاتف العامل مستخدم بالفعل.",
        });
      }

      if ((employee.salaryAmountDzd ?? null) !== null && !employee.salaryPeriod) {
        fieldErrors.push({
          field: buildBatchField(index, "salaryPeriod"),
          message: "يجب اختيار دورية الأجر مع قيمة الأجر.",
        });
      }

      if ((employee.salaryAmountDzd ?? null) === null && employee.salaryPeriod) {
        fieldErrors.push({
          field: buildBatchField(index, "salaryAmountDzd"),
          message: "يجب إدخال قيمة الأجر مع دورية الأجر.",
        });
      }

      if (role?.key !== SYSTEM_ROLE_KEYS.worker) {
        if (employee.managerId) {
          fieldErrors.push({
            field: buildBatchField(index, "managerId"),
            message: "يمكن تعيين مدير مباشر للعمال فقط.",
          });
        }

        if (employee.projectId) {
          fieldErrors.push({
            field: buildBatchField(index, "projectId"),
            message: "اختيار المشروع في هذا النموذج متاح للعمال فقط.",
          });
        }

        return;
      }

      if (employee.status !== "ACTIVE" && (employee.managerId || employee.projectId)) {
        fieldErrors.push({
          field: buildBatchField(index, employee.projectId ? "projectId" : "managerId"),
          message: "لا يمكن ربط عامل غير نشط بمدير أو مشروع نشط.",
        });
        return;
      }

      if (employee.status === "ACTIVE" && !employee.managerId) {
        fieldErrors.push({
          field: buildBatchField(index, "managerId"),
          message: "اختيار المدير المباشر مطلوب للعامل النشط.",
        });
      }

      if (employee.status === "ACTIVE" && !employee.projectId) {
        fieldErrors.push({
          field: buildBatchField(index, "projectId"),
          message: "اختيار المشروع مطلوب للعامل النشط.",
        });
      }

      if (!employee.managerId) {
        return;
      }

      const manager = this.repository.getEmployeeById(employee.managerId);

      if (!manager) {
        fieldErrors.push({
          field: buildBatchField(index, "managerId"),
          message: "تعذر العثور على المدير المطلوب.",
        });
        return;
      }

      const managerRole = this.repository.getRoleById(manager.roleId);

      if (managerRole?.key !== SYSTEM_ROLE_KEYS.projectManager) {
        fieldErrors.push({
          field: buildBatchField(index, "managerId"),
          message: "المدير المختار يجب أن يحمل دور مدير مشروع نشط.",
        });
      }

      if (manager.status !== "ACTIVE") {
        fieldErrors.push({
          field: buildBatchField(index, "managerId"),
          message: "المدير المختار يجب أن يكون نشطًا.",
        });
      }

      if (!employee.projectId) {
        return;
      }

      const project = this.repository.getProjectById(employee.projectId);

      if (!project) {
        fieldErrors.push({
          field: buildBatchField(index, "projectId"),
          message: "تعذر العثور على المشروع المطلوب.",
        });
        return;
      }

      if (project.status !== "ACTIVE") {
        fieldErrors.push({
          field: buildBatchField(index, "projectId"),
          message: "يمكن اختيار مشروع نشط فقط.",
        });
      }

      if (project.managerId !== employee.managerId) {
        fieldErrors.push({
          field: buildBatchField(index, "projectId"),
          message: "يجب أن يكون المشروع ضمن المشاريع التي يديرها المدير المختار.",
        });
      }
    });

    if (fieldErrors.length > 0) {
      throw new CompanyError(
        "VALIDATION",
        "تعذر حفظ دفعة العاملين. راجع الحقول المعلّمة ثم حاول مرة أخرى.",
        fieldErrors,
      );
    }

    const result = this.repository.createEmployeesBatch(normalizedEmployees, audit);

    return successResult("تم إنشاء دفعة العاملين بنجاح.", result);
  }

  updateEmployee(input: EmployeeUpdateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const current = this.requireEmployee(input.id);
    const currentRole = this.requireRole(current.roleId);
    const nextRole = input.roleId ? this.requireAssignableEmployeeRole(input.roleId, "roleId") : currentRole;
    const nextStatus = input.status ?? current.status;

    this.ensureEmployeeTransitionAllowed(current, currentRole.key, nextRole.key, nextStatus);

    if (currentRole.key !== SYSTEM_ROLE_KEYS.worker && nextRole.key === SYSTEM_ROLE_KEYS.worker && nextStatus === "ACTIVE") {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط.",
        [{ field: "roleId", message: "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط." }],
      );
    }

    if (input.phone && input.phone !== current.phone) {
      const existing = this.repository.getEmployeeByPhone(input.phone.trim());
      if (existing && existing.id !== input.id) {
        throw new CompanyError("CONFLICT", "رقم هاتف العامل مستخدم بالفعل.", [
          { field: "phone", message: "رقم هاتف العامل مستخدم بالفعل." },
        ]);
      }
    }

    const nextSalaryAmount =
      input.salaryAmountDzd !== undefined ? normalizeSalaryAmount(input.salaryAmountDzd) : current.salaryAmountDzd
    const nextSalaryPeriod = input.salaryPeriod !== undefined ? input.salaryPeriod : current.salaryPeriod

    if ((nextSalaryAmount ?? null) !== null && !nextSalaryPeriod) {
      throw new CompanyError("VALIDATION", "يجب اختيار دورية الأجر مع قيمة الأجر.", [
        { field: "salaryPeriod", message: "يجب اختيار دورية الأجر مع قيمة الأجر." },
      ])
    }

    if ((nextSalaryAmount ?? null) === null && nextSalaryPeriod) {
      throw new CompanyError("VALIDATION", "يجب إدخال قيمة الأجر مع دورية الأجر.", [
        { field: "salaryAmountDzd", message: "يجب إدخال قيمة الأجر مع دورية الأجر." },
      ])
    }

    const employee = this.repository.updateEmployee({
      id: input.id,
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      phone: input.phone?.trim(),
      roleId: input.roleId,
      status: input.status,
      salaryAmountDzd: input.salaryAmountDzd !== undefined ? normalizeSalaryAmount(input.salaryAmountDzd) : undefined,
      salaryPeriod: input.salaryPeriod !== undefined ? input.salaryPeriod : undefined,
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    }, audit);

    return successResult("تم تحديث بيانات العامل بنجاح.", employee!);
  }

  deleteEmployee(id: string) {
    const current = this.repository.getEmployeeById(id);
    if (!current) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
    }

    const hasManagerHistory =
      this.repository.listManagerAssignments({ workerId: id }).length > 0 ||
      this.repository.listManagerAssignments({ managerId: id }).length > 0;
    const hasProjectHistory = this.repository.listProjectAssignments({ employeeId: id }).length > 0;
    const hasWarehouseHistory = this.repository.listWarehouseAssignments({ employeeId: id }).length > 0;
    const hasManagedProjectHistory = this.repository.listProjectManagerOwnershipHistory({ managerId: id }).length > 0;
    const hasManagedWarehouseHistory = this.repository.listWarehouseManagerOwnershipHistory({ managerId: id }).length > 0;
    const hasSalaryPayments = this.repository.listSalaryPayments({ employeeId: id }).length > 0;
    const managesProjects = this.repository.listProjects({ managerId: id }).length > 0;
    const managesWarehouses = this.repository.listWarehouses({ managerId: id }).length > 0;

    if (
      hasManagerHistory ||
      hasProjectHistory ||
      hasWarehouseHistory ||
      hasManagedProjectHistory ||
      hasManagedWarehouseHistory ||
      hasSalaryPayments ||
      managesProjects ||
      managesWarehouses
    ) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "لا يمكن حذف العامل نهائيًا لأنه مرتبط بسجل عمل أو بإدارة قائمة. استخدم إنهاء بدلًا من ذلك.",
      );
    }

    this.repository.deleteEmployee(id);
    return deleteResult("تم حذف العامل نهائيًا بنجاح.");
  }

  listProjects(filters?: ProjectListFilters) {
    return { items: this.repository.listProjects(filters) };
  }

  getProject(id: string) {
    return successResult("تم تحميل المشروع بنجاح.", this.requireProject(id));
  }

  createProject(input: ProjectCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    if (input.managerId) {
      this.requireActiveEmployee(
        this.requireEmployeeWithRoleKey(input.managerId, SYSTEM_ROLE_KEYS.projectManager, "managerId"),
        "managerId",
      );
    }

    const project = this.repository.createProject({
      name: input.name.trim(),
      location: normalizeText(input.location),
      managerId: input.managerId ?? null,
      status: input.status,
      notes: normalizeText(input.notes),
    }, audit);

    return successResult("تم إنشاء المشروع بنجاح.", project);
  }

  updateProject(input: ProjectUpdateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const current = this.requireProject(input.id);
    const nextManagerId = input.managerId !== undefined ? input.managerId : current.managerId
    const nextStatus = input.status ?? current.status

    this.ensureProjectTransitionAllowed(current.id, current.managerId, input.managerId, input.status);

    if (input.managerId && input.managerId !== current.managerId) {
      this.requireActiveEmployee(
        this.requireEmployeeWithRoleKey(input.managerId, SYSTEM_ROLE_KEYS.projectManager, "managerId"),
        "managerId",
      );
    }

    const reassignWorkerIds =
      current.managerId !== nextManagerId && nextManagerId && nextStatus === "ACTIVE"
        ? this.listActiveWorkerIdsForProject(current.id, { requireManagerConsistencyWith: current.managerId })
        : undefined

    const project = this.repository.updateProject({
      id: input.id,
      name: input.name?.trim(),
      location: input.location !== undefined ? normalizeText(input.location) : undefined,
      managerId: input.managerId,
      reassignWorkerIds,
      status: input.status,
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    }, audit);

    return successResult("تم تحديث المشروع بنجاح.", project!);
  }

  listWarehouses(filters?: WarehouseListFilters) {
    return { items: this.repository.listWarehouses(filters) };
  }

  getWarehouse(id: string) {
    return successResult("تم تحميل المستودع بنجاح.", this.requireWarehouse(id));
  }

  createWarehouse(input: WarehouseCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    if (input.managerId) {
      this.requireActiveEmployee(
        this.requireEmployeeWithRoleKey(
          input.managerId,
          SYSTEM_ROLE_KEYS.warehouseManager,
          "managerId",
        ),
        "managerId",
      );
    }

    const warehouse = this.repository.createWarehouse({
      name: input.name.trim(),
      address: normalizeText(input.address),
      managerId: input.managerId ?? null,
      status: input.status,
      notes: normalizeText(input.notes),
    }, audit);

    return successResult("تم إنشاء المستودع بنجاح.", warehouse);
  }

  updateWarehouse(input: WarehouseUpdateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const current = this.requireWarehouse(input.id);

    this.ensureWarehouseTransitionAllowed(current.id, current.managerId, input.managerId, input.status);

    if (input.managerId && input.managerId !== current.managerId) {
      this.requireActiveEmployee(
        this.requireEmployeeWithRoleKey(
          input.managerId,
          SYSTEM_ROLE_KEYS.warehouseManager,
          "managerId",
        ),
        "managerId",
      );
    }

    const warehouse = this.repository.updateWarehouse({
      id: input.id,
      name: input.name?.trim(),
      address: input.address !== undefined ? normalizeText(input.address) : undefined,
      managerId: input.managerId,
      status: input.status,
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    }, audit);

    return successResult("تم تحديث المستودع بنجاح.", warehouse!);
  }

  assignEmployeeWorkplace(input: EmployeeAssignWorkplaceInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const employee = this.requireEmployee(input.employeeId);
    const role = this.requireRole(employee.roleId);

    if (employee.status !== "ACTIVE") {
      throw new CompanyError("BUSINESS_RULE", "لا يمكن تعديل مكان العمل إلا لعامل نشط.");
    }

    if (role.key !== SYSTEM_ROLE_KEYS.worker) {
      throw new CompanyError("BUSINESS_RULE", "تغيير مكان العمل المباشر متاح للعمال فقط من هذه العملية.");
    }

    if (input.nextType === "PROJECT") {
      if (!input.managerId) {
        throw new CompanyError("VALIDATION", "يجب اختيار مدير المشروع أولًا.", [
          { field: "managerId", message: "يجب اختيار مدير المشروع أولًا." },
        ]);
      }

      const manager = this.requireEmployeeWithRoleKey(input.managerId, SYSTEM_ROLE_KEYS.projectManager, "managerId");
      this.requireActiveEmployee(manager, "managerId");

      if (!input.projectId) {
        throw new CompanyError("VALIDATION", "يجب اختيار مشروع صالح.", [
          { field: "projectId", message: "يجب اختيار مشروع صالح." },
        ]);
      }

      const project = this.requireProject(input.projectId);

      if (project.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط العامل إلا بمشروع نشط.", [
          { field: "projectId", message: "لا يمكن ربط العامل إلا بمشروع نشط." },
        ]);
      }

      if (this.repository.getActiveWarehouseAssignmentByEmployeeId(input.employeeId)) {
        // switching is handled atomically below after validation
      }

      if (!project.managerId || project.managerId !== input.managerId) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.",
          [{ field: "projectId", message: "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل." }],
        );
      }
    }

    if (input.nextType === "WAREHOUSE") {
      throw new CompanyError(
        "BUSINESS_RULE",
        "ربط العمال من هذه الشاشة يتم عبر مدير مشروع ومشروع فقط.",
        [{ field: "warehouseId", message: "ربط العمال من هذه الشاشة يتم عبر مدير مشروع ومشروع فقط." }],
      )
    }

    this.repository.assignEmployeeWorkplace({
      employeeId: input.employeeId,
      nextType: input.nextType,
      managerId: input.managerId ?? null,
      projectId: input.projectId ?? null,
      warehouseId: input.warehouseId ?? null,
      notes: normalizeText(input.notes),
    }, audit);

    return deleteResult("تم تحديث مكان العمل بنجاح.");
  }

  syncManagedProjects(input: EmployeeSyncManagedProjectsInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const employee = this.requireEmployeeWithRoleKey(input.employeeId, SYSTEM_ROLE_KEYS.projectManager, "employeeId")
    this.requireActiveEmployee(employee, "employeeId")

    const selectedProjects = input.projectIds.map((projectId: string) => this.requireProject(projectId))
    const currentProjects = this.repository.listProjects({ managerId: input.employeeId })
    const nextProjectIds = new Set(input.projectIds)

    for (const project of selectedProjects) {
      if (project.status !== "ACTIVE" && project.managerId !== input.employeeId) {
        throw new CompanyError("BUSINESS_RULE", "يمكن اختيار مشاريع نشطة فقط.", [
          { field: "projectIds", message: "يمكن اختيار مشاريع نشطة فقط." },
        ])
      }

      if (project.managerId && project.managerId !== input.employeeId) {
        throw new CompanyError("BUSINESS_RULE", "لا يمكن اختيار مشروع مرتبط بمدير آخر من هذه الشاشة.", [
          { field: "projectIds", message: "لا يمكن اختيار مشروع مرتبط بمدير آخر من هذه الشاشة." },
        ])
      }
    }

    for (const currentProject of currentProjects) {
      if (!nextProjectIds.has(currentProject.id)) {
        this.ensureProjectTransitionAllowed(currentProject.id, input.employeeId, null, undefined)
      }
    }

    this.repository.syncManagedProjects({ employeeId: input.employeeId, projectIds: input.projectIds }, audit)
    return deleteResult("تم تحديث المشاريع المُدارة بنجاح.")
  }

  syncManagedWarehouses(input: EmployeeSyncManagedWarehousesInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const employee = this.requireEmployeeWithRoleKey(input.employeeId, SYSTEM_ROLE_KEYS.warehouseManager, "employeeId")
    this.requireActiveEmployee(employee, "employeeId")

    const selectedWarehouses = input.warehouseIds.map((warehouseId: string) => this.requireWarehouse(warehouseId))
    const currentWarehouses = this.repository.listWarehouses({ managerId: input.employeeId })
    const nextWarehouseIds = new Set(input.warehouseIds)

    for (const warehouse of selectedWarehouses) {
      if (warehouse.status !== "ACTIVE" && warehouse.managerId !== input.employeeId) {
        throw new CompanyError("BUSINESS_RULE", "يمكن اختيار مستودعات نشطة فقط.", [
          { field: "warehouseIds", message: "يمكن اختيار مستودعات نشطة فقط." },
        ])
      }

      if (warehouse.managerId && warehouse.managerId !== input.employeeId) {
        throw new CompanyError("BUSINESS_RULE", "لا يمكن اختيار مستودع مرتبط بمدير آخر من هذه الشاشة.", [
          { field: "warehouseIds", message: "لا يمكن اختيار مستودع مرتبط بمدير آخر من هذه الشاشة." },
        ])
      }
    }

    for (const currentWarehouse of currentWarehouses) {
      if (!nextWarehouseIds.has(currentWarehouse.id)) {
        this.ensureWarehouseTransitionAllowed(currentWarehouse.id, input.employeeId, null, undefined)
      }
    }

    this.repository.syncManagedWarehouses({ employeeId: input.employeeId, warehouseIds: input.warehouseIds }, audit)
    return deleteResult("تم تحديث المستودعات المُدارة بنجاح.")
  }

  listManagerAssignments(filters?: ManagerAssignmentListFilters) {
    return { items: this.repository.listManagerAssignments(filters) };
  }

  getManagerAssignment(id: string) {
    const assignment = this.repository.getManagerAssignmentById(id);
    if (!assignment) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المدير.");
    }

    return successResult("تم تحميل ربط المدير بنجاح.", assignment);
  }

  createManagerAssignment(input: ManagerAssignmentCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const worker = this.requireEmployeeWithRoleKey(input.workerId, SYSTEM_ROLE_KEYS.worker, "workerId");
    const manager = this.requireEmployeeWithRoleKey(input.managerId, SYSTEM_ROLE_KEYS.projectManager, "managerId");

    if (input.status === "ACTIVE") {
      this.requireActiveEmployee(worker, "workerId");
      this.requireActiveEmployee(manager, "managerId");
    }

    if (input.status === "ACTIVE" && this.repository.getActiveManagerAssignmentByWorkerId(input.workerId)) {
      throw new CompanyError(
        "CONFLICT",
        "هذا العامل مرتبط حاليًا بمدير نشط بالفعل.",
        [{ field: "workerId", message: "هذا العامل مرتبط حاليًا بمدير نشط بالفعل." }],
      );
    }

    const assignment = this.repository.createManagerAssignment({
      workerId: input.workerId,
      managerId: input.managerId,
      status: input.status,
      startDate: normalizeTimestamp(input.startDate),
      endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
      notes: normalizeText(input.notes),
    }, audit);

    return successResult("تم إنشاء ربط المدير بنجاح.", assignment);
  }

  endManagerAssignment(input: ManagerAssignmentEndInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const current = this.repository.getManagerAssignmentById(input.id);
    if (!current) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المدير.");
    }

    if (current.status !== "ACTIVE") {
      throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المدير النشطة فقط.");
    }

    const activeProject = this.repository.getActiveProjectAssignmentByEmployeeId(current.workerId);
    if (activeProject) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يجب إنهاء المشروع النشط للعامل قبل إنهاء ربط المدير.",
      );
    }

    const assignment = this.repository.endManagerAssignment({
      id: input.id,
      endDate: normalizeTimestamp(input.endDate),
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    }, audit);

    return successResult("تم إنهاء ربط المدير بنجاح.", assignment!);
  }

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

  createProjectAssignment(input: ProjectAssignmentCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const employee = this.requireEmployee(input.employeeId);
    const employeeRole = this.requireRole(employee.roleId);
    const project = this.requireProject(input.projectId);

    if (input.status === "ACTIVE") {
      this.requireActiveEmployee(employee, "employeeId");

      if (
        employeeRole.key !== SYSTEM_ROLE_KEYS.worker &&
        employeeRole.key !== SYSTEM_ROLE_KEYS.projectManager &&
        employeeRole.key !== SYSTEM_ROLE_KEYS.warehouseManager
      ) {
        throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط هذا الدور بموقع عمل نشط.", [
          { field: "employeeId", message: "لا يمكن ربط هذا الدور بموقع عمل نشط." },
        ])
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

      const activeManagerAssignment = this.repository.getActiveManagerAssignmentByWorkerId(input.employeeId);
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

    const assignment = this.repository.createProjectAssignment({
      employeeId: input.employeeId,
      projectId: input.projectId,
      status: input.status,
      startDate: normalizeTimestamp(input.startDate),
      endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
      notes: normalizeText(input.notes),
    }, audit);

    return successResult("تم إنشاء ربط المشروع بنجاح.", assignment);
  }

  endProjectAssignment(input: ProjectAssignmentEndInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const current = this.repository.getProjectAssignmentById(input.id);
    if (!current) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المشروع.");
    }

    if (current.status !== "ACTIVE") {
      throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المشاريع النشطة فقط.");
    }

    const assignment = this.repository.endProjectAssignment({
      id: input.id,
      endDate: normalizeTimestamp(input.endDate),
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    }, audit);

    return successResult("تم إنهاء ربط المشروع بنجاح.", assignment!);
  }

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters) {
    return { items: this.repository.listWarehouseAssignments(filters) };
  }

  createSalaryPayment(input: EmployeeSalaryPaymentCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const employee = this.requireEmployee(input.employeeId)
    const expectedAmount = employee.salaryAmountDzd ?? null
    const periodType = employee.salaryPeriod ?? null

    if (expectedAmount === null || periodType === null) {
      throw new CompanyError("BUSINESS_RULE", "يجب تحديد أجر العامل الحالي قبل تسجيل دفعة راتب.", [
        { field: "employeeId", message: "يجب تحديد أجر العامل الحالي قبل تسجيل دفعة راتب." },
      ])
    }

    const payment = this.repository.createSalaryPayment({
      employeeId: input.employeeId,
      periodType,
      expectedAmountDzd: expectedAmount,
      actualAmountDzd: input.actualAmountDzd,
      paymentDate: normalizeTimestamp(input.paymentDate),
      note: normalizeText(input.note),
    }, audit)

    return successResult("تم تسجيل دفعة الراتب بنجاح.", payment)
  }

  getWarehouseAssignment(id: string) {
    const assignment = this.repository.getWarehouseAssignmentById(id);
    if (!assignment) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المستودع.");
    }

    return successResult("تم تحميل ربط المستودع بنجاح.", assignment);
  }

  createWarehouseAssignment(input: WarehouseAssignmentCreateInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const employee = this.requireEmployee(input.employeeId);
    const employeeRole = this.requireRole(employee.roleId);
    const warehouse = this.requireWarehouse(input.warehouseId);

    if (input.status === "ACTIVE") {
      this.requireActiveEmployee(employee, "employeeId");

      if (
        employeeRole.key !== SYSTEM_ROLE_KEYS.worker &&
        employeeRole.key !== SYSTEM_ROLE_KEYS.projectManager &&
        employeeRole.key !== SYSTEM_ROLE_KEYS.warehouseManager
      ) {
        throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط هذا الدور بموقع عمل نشط.", [
          { field: "employeeId", message: "لا يمكن ربط هذا الدور بموقع عمل نشط." },
        ])
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

    const assignment = this.repository.createWarehouseAssignment({
      employeeId: input.employeeId,
      warehouseId: input.warehouseId,
      status: input.status,
      startDate: normalizeTimestamp(input.startDate),
      endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
      notes: normalizeText(input.notes),
    }, audit);

    return successResult("تم إنشاء ربط المستودع بنجاح.", assignment);
  }

  endWarehouseAssignment(input: WarehouseAssignmentEndInput, auditContext?: MutationAuditContext) {
    const audit = normalizeMutationAuditContext(auditContext)

    const current = this.repository.getWarehouseAssignmentById(input.id);
    if (!current) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المستودع.");
    }

    if (current.status !== "ACTIVE") {
      throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المستودعات النشطة فقط.");
    }

    const assignment = this.repository.endWarehouseAssignment({
      id: input.id,
      endDate: normalizeTimestamp(input.endDate),
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    }, audit);

    return successResult("تم إنهاء ربط المستودع بنجاح.", assignment!);
  }

  private ensureEmployeeTransitionAllowed(
    employee: ReturnType<CompanyService["requireEmployee"]>,
    currentRoleKey: string,
    nextRoleKey: string,
    nextStatus: string,
  ) {
    const hasActiveManagerAssignment = Boolean(
      this.repository.getActiveManagerAssignmentByWorkerId(employee.id),
    )
    const hasActiveProjectAssignment = Boolean(
      this.repository.getActiveProjectAssignmentByEmployeeId(employee.id),
    )
    const hasActiveWarehouseAssignment = Boolean(
      this.repository.getActiveWarehouseAssignmentByEmployeeId(employee.id),
    )

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
      )
    }

    if (
      currentRoleKey === SYSTEM_ROLE_KEYS.projectManager &&
      (nextRoleKey !== SYSTEM_ROLE_KEYS.projectManager || nextStatus !== "ACTIVE")
    ) {
      const hasActiveManagedProjects = this.repository.listProjects({
        managerId: employee.id,
        status: "ACTIVE",
      }).length > 0
      const hasActiveWorkers = this.repository.listManagerAssignments({
        managerId: employee.id,
        status: "ACTIVE",
      }).length > 0

      if (hasActiveManagedProjects || hasActiveWorkers || hasActiveProjectAssignment || hasActiveWarehouseAssignment) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين أو يرتبط بموقع عمل نشط.",
          [
            {
              field: "status",
              message: "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين أو يرتبط بموقع عمل نشط.",
            },
          ],
        )
      }
    }

    if (
      currentRoleKey === SYSTEM_ROLE_KEYS.warehouseManager &&
      (nextRoleKey !== SYSTEM_ROLE_KEYS.warehouseManager || nextStatus !== "ACTIVE")
    ) {
      const hasActiveWarehouses = this.repository.listWarehouses({
        managerId: employee.id,
        status: "ACTIVE",
      }).length > 0

      if (hasActiveWarehouses || hasActiveProjectAssignment || hasActiveWarehouseAssignment) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تغيير حالة مدير المخزن أو دوره ما دام يدير مستودعات نشطة أو يرتبط بموقع عمل نشط.",
          [
            {
              field: "status",
              message: "لا يمكن تغيير حالة مدير المخزن أو دوره ما دام يدير مستودعات نشطة أو يرتبط بموقع عمل نشط.",
            },
          ],
        )
      }
    }
  }

  private ensureProjectTransitionAllowed(
    projectId: string,
    currentManagerId: string | null,
    nextManagerId: string | null | undefined,
    nextStatus: string | undefined,
  ) {
    const activeAssignments = this.repository.listProjectAssignments({
      projectId,
      status: "ACTIVE",
    })

    if (activeAssignments.length === 0) {
      return
    }

    const activeWorkerAssignments = activeAssignments.filter((assignment) => {
      const employee = this.repository.getEmployeeById(assignment.employeeId)
      if (!employee) {
        return false
      }

      return this.repository.getRoleById(employee.roleId)?.key === SYSTEM_ROLE_KEYS.worker
    })

    const managerWillChange = nextManagerId !== undefined && nextManagerId !== currentManagerId
    const projectWillDeactivate = nextStatus !== undefined && nextStatus !== "ACTIVE"

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
      )
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
      )
    }
  }

  private ensureWarehouseTransitionAllowed(
    warehouseId: string,
    currentManagerId: string | null,
    nextManagerId: string | null | undefined,
    nextStatus: string | undefined,
  ) {
    const activeAssignments = this.repository.listWarehouseAssignments({
      warehouseId,
      status: "ACTIVE",
    })

    const managerWillChange = nextManagerId !== undefined && nextManagerId !== currentManagerId
    const warehouseWillDeactivate = nextStatus !== undefined && nextStatus !== "ACTIVE"

    if (activeAssignments.length === 0 && !(warehouseWillDeactivate && currentManagerId !== null)) {
      return
    }

    if (warehouseWillDeactivate && (activeAssignments.length > 0 || currentManagerId !== null)) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "لا يمكن أرشفة المستودع أو تعطيله قبل إنهاء ارتباط المدير الحالي والعاملين النشطين به.",
        [
          {
            field: "status",
            message: "لا يمكن أرشفة المستودع أو تعطيله قبل إنهاء ارتباط المدير الحالي والعاملين النشطين به.",
          },
        ],
      )
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
      )
    }
  }

  private listActiveWorkerIdsForProject(
    projectId: string,
    options?: { requireManagerConsistencyWith?: string | null },
  ) {
    return this.repository
      .listProjectAssignments({ projectId, status: "ACTIVE" })
      .filter((assignment) => {
        const employee = this.repository.getEmployeeById(assignment.employeeId)
        if (!employee) {
          return false
        }

        const employeeRole = this.repository.getRoleById(employee.roleId)
        if (employeeRole?.key !== SYSTEM_ROLE_KEYS.worker) {
          return false
        }

        if (options?.requireManagerConsistencyWith === undefined) {
          return true
        }

        const activeManagerAssignment = this.repository.getActiveManagerAssignmentByWorkerId(assignment.employeeId)
        if (!activeManagerAssignment || activeManagerAssignment.managerId !== options.requireManagerConsistencyWith) {
          throw new CompanyError(
            "BUSINESS_RULE",
            "لا يمكن تغيير مدير المشروع لأن روابط المدير الحالية للعمال غير متطابقة مع هذا المشروع. أصلح الربط الحالي أولًا.",
            [
              {
                field: "managerId",
                message: "لا يمكن تغيير مدير المشروع لأن روابط المدير الحالية للعمال غير متطابقة مع هذا المشروع. أصلح الربط الحالي أولًا.",
              },
            ],
          )
        }

        return true
      })
      .map((assignment) => assignment.employeeId)
  }

  private requireRole(roleId: string) {
    const role = this.repository.getRoleById(roleId);
    if (!role) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الدور المطلوب.", [
        { field: "roleId", message: "تعذر العثور على الدور المطلوب." },
      ]);
    }

    return role;
  }

  private requireAssignableEmployeeRole(roleId: string, field: string) {
    const role = this.requireRole(roleId)

    if (
      !role.isSystem ||
      !Object.values(SYSTEM_ROLE_KEYS).includes(
        role.key as (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS],
      )
    ) {
      throw new CompanyError("BUSINESS_RULE", "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة.", [
        { field, message: "يمكن اختيار الأدوار النظامية فقط في هذه المرحلة." },
      ])
    }

    return role
  }

  private requireEmployee(employeeId: string) {
    const employee = this.repository.getEmployeeById(employeeId);
    if (!employee) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
    }

    return employee;
  }

  private requireProject(projectId: string) {
    const project = this.repository.getProjectById(projectId);
    if (!project) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.");
    }

    return project;
  }

  private requireWarehouse(warehouseId: string) {
    const warehouse = this.repository.getWarehouseById(warehouseId);
    if (!warehouse) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على المستودع المطلوب.");
    }

    return warehouse;
  }

  private requireEmployeeWithRoleKey(employeeId: string, roleKey: string, field: string) {
    const employee = this.requireEmployee(employeeId);
    const role = this.requireRole(employee.roleId);

    if (role.key !== roleKey) {
      throw new CompanyError("BUSINESS_RULE", `العامل لا يملك الدور المطلوب: ${roleKey}.`, [
        { field, message: `العامل لا يملك الدور المطلوب: ${roleKey}.` },
      ]);
    }

    return employee;
  }

  private requireActiveEmployee(employee: ReturnType<CompanyService["requireEmployee"]>, field: string) {
    if (employee.status !== "ACTIVE") {
      throw new CompanyError("BUSINESS_RULE", "يجب أن يكون العامل بحالة نشطة لإتمام هذه العملية.", [
        { field, message: "يجب أن يكون العامل بحالة نشطة لإتمام هذه العملية." },
      ]);
    }

    return employee;
  }
}
