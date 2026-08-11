/**
 * Workforce service.
 *
 * Owns employee and role CRUD, the workplace-assignment lifecycle
 * (manager assignments, employee workplace, managed project /
 * warehouse sync), and the salary payment log. It is the real
 * implementation — not a facade over `CompanyService` — and depends
 * on a `CompanyRepository` plus a `WorkspaceMutationContext` for
 * transactions and audit authorization.
 *
 * Extracted from `CompanyService` as part of Plan 005 Phase 3
* (issue #177) so the former 2k-line service stops owning every
 * domain.
 */

import {
  type EmployeeAssignWorkplaceInput,
  type EmployeeBatchCreateInput,
  type EmployeeCreateInput,
  type EmployeeSalaryPaymentCreateInput,
  type EmployeeSyncManagedProjectsInput,
  type EmployeeSyncManagedWarehousesInput,
  type EmployeeUpdateInput,
  type ManagerAssignmentCreateInput,
  type ManagerAssignmentEndInput,
  type RoleCreateInput,
  type RoleUpdateInput,
} from "@tuari/contracts";

import { CompanyError } from "./company.errors";
import {
  buildBatchField,
  deleteResult,
  normalizeSalaryAmount,
  normalizeText,
  successResult,
} from "./company.helpers";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { WorkforceRepository } from "./workforce.repository";
import type { OperationsRepository } from "./operations.repository";
import {
  isAssignableEmployeeRoleKey,
  type EmployeeListFilters,
  type EmployeeSalaryPaymentListFilters,
  type EmployeeStateHistoryListFilters,
  type ManagerAssignmentListFilters,
  type MutationAuditContext,
  type ProjectManagerOwnershipHistoryListFilters,
  type WarehouseManagerOwnershipHistoryListFilters,
  LEGACY_WORKFORCE_ROLE_KEYS,
} from "./company.types";
import { normalizeAlgeriaTimestamp } from "./company-time";
import {
  ensureEmployeeTransitionAllowed,
  ensureProjectTransitionAllowed,
  ensureWarehouseTransitionAllowed,
  requireActiveEmployee,
  requireAssignableEmployeeRole,
  requireEmployee,
  requireEmployeeWithRoleKey,
  requireProject,
  requireRole,
  requireWarehouse,
} from "./company.entity-resolvers";

export class WorkforceService {
  constructor(
    private readonly repository: WorkforceRepository,
    private readonly operationsRepo: OperationsRepository,
    private readonly mutation: WorkspaceMutationContext,
  ) {}

  // ---------------------------------------------------------------------------
  // Roles
  // ---------------------------------------------------------------------------

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

  createRole(_input: RoleCreateInput): never {
    throw new CompanyError(
      "BUSINESS_RULE",
      "إدارة الأدوار المخصصة غير متاحة في هذه المرحلة.",
    );
  }

  updateRole(_input: RoleUpdateInput): never {
    throw new CompanyError(
      "BUSINESS_RULE",
      "إدارة الأدوار المخصصة غير متاحة في هذه المرحلة.",
    );
  }

  deleteRole(id: string): never {
    void id;
    throw new CompanyError(
      "BUSINESS_RULE",
      "إدارة الأدوار المخصصة غير متاحة في هذه المرحلة.",
    );
  }

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  listEmployees(filters?: EmployeeListFilters) {
    return { items: this.repository.listEmployees(filters) };
  }

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters) {
    return { items: this.repository.listEmployeeStateHistory(filters) };
  }

  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters) {
    return { items: this.operationsRepo.listProjectManagerOwnershipHistory(filters) };
  }

  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters) {
    return { items: this.operationsRepo.listWarehouseManagerOwnershipHistory(filters) };
  }

  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters) {
    return { items: this.repository.listSalaryPayments(filters) };
  }

  getEmployee(id: string) {
    return successResult("تم تحميل العامل بنجاح.", requireEmployee(this.repository, id));
  }

  createEmployee(input: EmployeeCreateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      requireAssignableEmployeeRole(this.repository, input.roleId, "roleId");

      if ((input.salaryAmountDzd ?? null) !== null && !input.salaryPeriod) {
        throw new CompanyError("VALIDATION", "يجب اختيار دورية الأجر مع قيمة الأجر.", [
          { field: "salaryPeriod", message: "يجب اختيار دورية الأجر مع قيمة الأجر." },
        ]);
      }

      if ((input.salaryAmountDzd ?? null) === null && input.salaryPeriod) {
        throw new CompanyError("VALIDATION", "يجب إدخال قيمة الأجر مع دورية الأجر.", [
          { field: "salaryAmountDzd", message: "يجب إدخال قيمة الأجر مع دورية الأجر." },
        ]);
      }

      if (this.repository.getEmployeeByPhone(input.phone)) {
        throw new CompanyError("CONFLICT", "رقم هاتف العامل مستخدم بالفعل.", [
          { field: "phone", message: "رقم هاتف العامل مستخدم بالفعل." },
        ]);
      }

      const employee = this.repository.createEmployee(
        {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone.trim(),
          roleId: input.roleId,
          status: input.status,
          salaryAmountDzd: normalizeSalaryAmount(input.salaryAmountDzd),
          salaryPeriod: input.salaryPeriod ?? null,
          notes: normalizeText(input.notes),
        },
        audit,
      );

      return successResult("تم إنشاء العامل بنجاح.", employee);
    });
  }

  createEmployeesBatch(input: EmployeeBatchCreateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

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
      }> = input.employees.map((employee) => ({
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

      normalizedEmployees.forEach((employee, index) => {
        const role = this.repository.getRoleById(employee.roleId);

        if (!role) {
          fieldErrors.push({
            field: buildBatchField(index, "roleId"),
            message: "تعذر العثور على الدور المطلوب.",
          });
        } else if (!role.isSystem || !isAssignableEmployeeRoleKey(role.key)) {
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

        if (role?.key !== LEGACY_WORKFORCE_ROLE_KEYS.worker) {
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

        if (managerRole?.key !== LEGACY_WORKFORCE_ROLE_KEYS.projectManager) {
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

        const project = this.operationsRepo.getProjectById(employee.projectId);

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
    });
  }

  updateEmployee(input: EmployeeUpdateInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const current = requireEmployee(this.repository, input.id);
      const currentRole = requireRole(this.repository, current.roleId);
      const nextRole = input.roleId
        ? requireAssignableEmployeeRole(this.repository, input.roleId, "roleId")
        : currentRole;
      const nextStatus = input.status ?? current.status;

      ensureEmployeeTransitionAllowed(
        this.repository,
        this.operationsRepo,
        current,
        currentRole.key,
        nextRole.key,
        nextStatus,
      );

      if (
        currentRole.key !== LEGACY_WORKFORCE_ROLE_KEYS.worker &&
        nextRole.key === LEGACY_WORKFORCE_ROLE_KEYS.worker &&
        nextStatus === "ACTIVE"
      ) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط.",
          [
            {
              field: "roleId",
              message:
                "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط.",
            },
          ],
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
        input.salaryAmountDzd !== undefined
          ? normalizeSalaryAmount(input.salaryAmountDzd)
          : current.salaryAmountDzd;
      const nextSalaryPeriod = input.salaryPeriod !== undefined ? input.salaryPeriod : current.salaryPeriod;

      if ((nextSalaryAmount ?? null) !== null && !nextSalaryPeriod) {
        throw new CompanyError("VALIDATION", "يجب اختيار دورية الأجر مع قيمة الأجر.", [
          { field: "salaryPeriod", message: "يجب اختيار دورية الأجر مع قيمة الأجر." },
        ]);
      }

      if ((nextSalaryAmount ?? null) === null && nextSalaryPeriod) {
        throw new CompanyError("VALIDATION", "يجب إدخال قيمة الأجر مع دورية الأجر.", [
          { field: "salaryAmountDzd", message: "يجب إدخال قيمة الأجر مع دورية الأجر." },
        ]);
      }

      const employee = this.repository.updateEmployee(
        {
          id: input.id,
          firstName: input.firstName?.trim(),
          lastName: input.lastName?.trim(),
          phone: input.phone?.trim(),
          roleId: input.roleId,
          status: input.status,
          salaryAmountDzd:
            input.salaryAmountDzd !== undefined
              ? normalizeSalaryAmount(input.salaryAmountDzd)
              : undefined,
          salaryPeriod: input.salaryPeriod !== undefined ? input.salaryPeriod : undefined,
          notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
        },
        audit,
      );

      return successResult("تم تحديث بيانات العامل بنجاح.", employee!);
    });
  }

  deleteEmployee(id: string, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      this.mutation.createMutationAuditContext(auditContext);

      const current = this.repository.getEmployeeById(id);
      if (!current) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
      }

      const hasManagerHistory =
        this.repository.listManagerAssignments({ workerId: id }).length > 0 ||
        this.repository.listManagerAssignments({ managerId: id }).length > 0;
      const hasProjectHistory =
        this.operationsRepo.listProjectAssignments({ employeeId: id }).length > 0;
      const hasWarehouseHistory =
        this.operationsRepo.listWarehouseAssignments({ employeeId: id }).length > 0;
      const hasManagedProjectHistory =
        this.operationsRepo.listProjectManagerOwnershipHistory({ managerId: id }).length > 0;
      const hasManagedWarehouseHistory =
        this.operationsRepo.listWarehouseManagerOwnershipHistory({ managerId: id }).length > 0;
      const hasSalaryPayments =
        this.repository.listSalaryPayments({ employeeId: id }).length > 0;
      const managesProjects = this.operationsRepo.listProjects({ managerId: id }).length > 0;
      const managesWarehouses = this.operationsRepo.listWarehouses({ managerId: id }).length > 0;

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
    });
  }

  // ---------------------------------------------------------------------------
  // Salary payments
  // ---------------------------------------------------------------------------

  createSalaryPayment(
    input: EmployeeSalaryPaymentCreateInput,
    auditContext?: MutationAuditContext,
  ) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const employee = requireEmployee(this.repository, input.employeeId);
      const expectedAmount = employee.salaryAmountDzd ?? null;
      const periodType = employee.salaryPeriod ?? null;

      if (expectedAmount === null || periodType === null) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "يجب تحديد أجر العامل الحالي قبل تسجيل دفعة راتب.",
          [
            {
              field: "employeeId",
              message: "يجب تحديد أجر العامل الحالي قبل تسجيل دفعة راتب.",
            },
          ],
        );
      }

      if (!Number.isFinite(input.actualAmountDzd) || input.actualAmountDzd <= 0) {
        throw new CompanyError("VALIDATION", "يجب إدخال مبلغ راتب أكبر من صفر.", [
          { field: "actualAmountDzd", message: "يجب إدخال مبلغ راتب أكبر من صفر." },
        ]);
      }

      const payment = this.repository.createSalaryPayment(
        {
          employeeId: input.employeeId,
          periodType,
          expectedAmountDzd: expectedAmount,
          actualAmountDzd: input.actualAmountDzd,
          paymentDate: normalizeAlgeriaTimestamp(input.paymentDate),
          note: normalizeText(input.note),
        },
        audit,
      );

      return successResult("تم تسجيل دفعة الراتب بنجاح.", payment);
    });
  }

  // ---------------------------------------------------------------------------
  // Manager assignments (worker → project manager)
  // ---------------------------------------------------------------------------

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

  createManagerAssignment(
    input: ManagerAssignmentCreateInput,
    auditContext?: MutationAuditContext,
  ) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const worker = requireEmployeeWithRoleKey(
        this.repository,
        input.workerId,
        LEGACY_WORKFORCE_ROLE_KEYS.worker,
        "workerId",
      );
      const manager = requireEmployeeWithRoleKey(
        this.repository,
        input.managerId,
        LEGACY_WORKFORCE_ROLE_KEYS.projectManager,
        "managerId",
      );

      if (input.status === "ACTIVE") {
        requireActiveEmployee(worker, "workerId");
        requireActiveEmployee(manager, "managerId");
      }

      if (input.status === "ACTIVE" && this.repository.getActiveManagerAssignmentByWorkerId(input.workerId)) {
        throw new CompanyError(
          "CONFLICT",
          "هذا العامل مرتبط حاليًا بمدير نشط بالفعل.",
          [{ field: "workerId", message: "هذا العامل مرتبط حاليًا بمدير نشط بالفعل." }],
        );
      }

      const assignment = this.repository.createManagerAssignment(
        {
          workerId: input.workerId,
          managerId: input.managerId,
          status: input.status,
          startDate: normalizeAlgeriaTimestamp(input.startDate),
          endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
          notes: normalizeText(input.notes),
        },
        audit,
      );

      return successResult("تم إنشاء ربط المدير بنجاح.", assignment);
    });
  }

  endManagerAssignment(input: ManagerAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(auditContext);

      const current = this.repository.getManagerAssignmentById(input.id);
      if (!current) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المدير.");
      }

      if (current.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المدير النشطة فقط.");
      }

      const activeProject = this.operationsRepo.getActiveProjectAssignmentByEmployeeId(current.workerId);
      if (activeProject) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "يجب إنهاء المشروع النشط للعامل قبل إنهاء ربط المدير.",
        );
      }

      const assignment = this.repository.endManagerAssignment(
        {
          id: input.id,
          endDate: normalizeAlgeriaTimestamp(input.endDate),
          notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
        },
        audit,
      );

      return successResult("تم إنهاء ربط المدير بنجاح.", assignment!);
    });
  }

  // ---------------------------------------------------------------------------
  // Workplace assignment / managed project + warehouse sync
  // ---------------------------------------------------------------------------

  assignEmployeeWorkplace(
    input: EmployeeAssignWorkplaceInput,
    auditContext?: MutationAuditContext,
  ) {
    const audit = this.mutation.createMutationAuditContext(auditContext);

    const employee = requireEmployee(this.repository, input.employeeId);
    const role = requireRole(this.repository, employee.roleId);

    if (employee.status !== "ACTIVE") {
      throw new CompanyError("BUSINESS_RULE", "لا يمكن تعديل مكان العمل إلا لعامل نشط.");
    }

    if (role.key !== LEGACY_WORKFORCE_ROLE_KEYS.worker) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "تغيير مكان العمل المباشر متاح للعمال فقط من هذه العملية.",
      );
    }

    if (input.nextType === "PROJECT") {
      if (!input.managerId) {
        throw new CompanyError("VALIDATION", "يجب اختيار مدير المشروع أولًا.", [
          { field: "managerId", message: "يجب اختيار مدير المشروع أولًا." },
        ]);
      }

      const manager = requireEmployeeWithRoleKey(
        this.repository,
        input.managerId,
        LEGACY_WORKFORCE_ROLE_KEYS.projectManager,
        "managerId",
      );
      requireActiveEmployee(manager, "managerId");

      if (!input.projectId) {
        throw new CompanyError("VALIDATION", "يجب اختيار مشروع صالح.", [
          { field: "projectId", message: "يجب اختيار مشروع صالح." },
        ]);
      }

      const project = requireProject(this.operationsRepo, input.projectId);

      if (project.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط العامل إلا بمشروع نشط.", [
          { field: "projectId", message: "لا يمكن ربط العامل إلا بمشروع نشط." },
        ]);
      }

      if (!project.managerId || project.managerId !== input.managerId) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.",
          [
            {
              field: "projectId",
              message: "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.",
            },
          ],
        );
      }
    }

    if (input.nextType === "WAREHOUSE") {
      throw new CompanyError(
        "BUSINESS_RULE",
        "ربط العمال من هذه الشاشة يتم عبر مدير مشروع ومشروع فقط.",
        [{ field: "warehouseId", message: "ربط العمال من هذه الشاشة يتم عبر مدير مشروع ومشروع فقط." }],
      );
    }

    this.repository.assignEmployeeWorkplace(
      {
        employeeId: input.employeeId,
        nextType: input.nextType,
        managerId: input.managerId ?? null,
        projectId: input.projectId ?? null,
        warehouseId: input.warehouseId ?? null,
        notes: normalizeText(input.notes),
      },
      audit,
    );

    return deleteResult("تم تحديث مكان العمل بنجاح.");
  }

  syncManagedProjects(
    input: EmployeeSyncManagedProjectsInput,
    auditContext?: MutationAuditContext,
  ) {
    const audit = this.mutation.createMutationAuditContext(auditContext);

    const employee = requireEmployeeWithRoleKey(
      this.repository,
      input.employeeId,
      LEGACY_WORKFORCE_ROLE_KEYS.projectManager,
      "employeeId",
    );
    requireActiveEmployee(employee, "employeeId");

    const selectedProjects = input.projectIds.map((projectId) =>
      requireProject(this.operationsRepo, projectId),
    );
    const currentProjects = this.operationsRepo.listProjects({ managerId: input.employeeId });
    const nextProjectIds = new Set(input.projectIds);

    for (const project of selectedProjects) {
      if (project.status !== "ACTIVE" && project.managerId !== input.employeeId) {
        throw new CompanyError("BUSINESS_RULE", "يمكن اختيار مشاريع نشطة فقط.", [
          { field: "projectIds", message: "يمكن اختيار مشاريع نشطة فقط." },
        ]);
      }

      if (project.managerId && project.managerId !== input.employeeId) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن اختيار مشروع مرتبط بمدير آخر من هذه الشاشة.",
          [
            {
              field: "projectIds",
              message: "لا يمكن اختيار مشروع مرتبط بمدير آخر من هذه الشاشة.",
            },
          ],
        );
      }
    }

    for (const currentProject of currentProjects) {
      if (!nextProjectIds.has(currentProject.id)) {
        ensureProjectTransitionAllowed(
          this.operationsRepo,
          this.repository,
          currentProject.id,
          input.employeeId,
          null,
          undefined,
        );
      }
    }

    this.repository.syncManagedProjects(
      { employeeId: input.employeeId, projectIds: input.projectIds },
      audit,
    );
    return deleteResult("تم تحديث المشاريع المُدارة بنجاح.");
  }

  syncManagedWarehouses(
    input: EmployeeSyncManagedWarehousesInput,
    auditContext?: MutationAuditContext,
  ) {
    const audit = this.mutation.createMutationAuditContext(auditContext);

    const employee = requireEmployeeWithRoleKey(
      this.repository,
      input.employeeId,
      LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager,
      "employeeId",
    );
    requireActiveEmployee(employee, "employeeId");

    const selectedWarehouses = input.warehouseIds.map((warehouseId) =>
      requireWarehouse(this.operationsRepo, warehouseId),
    );
    const currentWarehouses = this.operationsRepo.listWarehouses({ managerId: input.employeeId });
    const nextWarehouseIds = new Set(input.warehouseIds);

    for (const warehouse of selectedWarehouses) {
      if (warehouse.status !== "ACTIVE" && warehouse.managerId !== input.employeeId) {
        throw new CompanyError("BUSINESS_RULE", "يمكن اختيار مستودعات نشطة فقط.", [
          { field: "warehouseIds", message: "يمكن اختيار مستودعات نشطة فقط." },
        ]);
      }

      if (warehouse.managerId && warehouse.managerId !== input.employeeId) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن اختيار مستودع مرتبط بمدير آخر من هذه الشاشة.",
          [
            {
              field: "warehouseIds",
              message: "لا يمكن اختيار مستودع مرتبط بمدير آخر من هذه الشاشة.",
            },
          ],
        );
      }
    }

    for (const currentWarehouse of currentWarehouses) {
      if (!nextWarehouseIds.has(currentWarehouse.id)) {
        ensureWarehouseTransitionAllowed(
          this.operationsRepo,
          currentWarehouse.id,
          input.employeeId,
          null,
          undefined,
        );
      }
    }

    this.repository.syncManagedWarehouses(
      { employeeId: input.employeeId, warehouseIds: input.warehouseIds },
      audit,
    );
    return deleteResult("تم تحديث المستودعات المُدارة بنجاح.");
  }
}
