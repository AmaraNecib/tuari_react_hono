import { employeePagedListInputSchema, exactEmployeeBatchCreateInputSchema, type ExactEmployeeBatchCreateInput, employeeSyncManagedProjectsInputSchema, employeeSyncManagedWarehousesInputSchema, type EmployeeSyncManagedProjectsInput, type EmployeeSyncManagedWarehousesInput, exactEmployeeSaveInputSchema, employeeAssignWorkplaceInputSchema, type ExactEmployeeSaveInput, type EmployeeAssignWorkplaceInput, exactEmployeeCreateInputSchema, exactEmployeeUpdateInputSchema, type ExactEmployeeCreateInput, type ExactEmployeeUpdateInput } from "@tuari/contracts";
import { CompanyError } from "./company.errors";
import { normalizeText, successResult, deleteResult, type WorkspaceAdminAuthorizer } from "./company.helpers";
import { assertEmployeeTransitionAllowed, requireAssignableEmployeeRole, requireRole } from "./company.entity-resolvers";
import { LEGACY_WORKFORCE_ROLE_KEYS, type MutationAuditContext, type EmployeeListFilters, type EmployeeStateHistoryListFilters } from "./company.types";
import { assertActiveEmployeeSeatAvailable } from "./employee-seat-limit";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { ExactEmployeeRepository } from "./employee-exact.repository";
import { decodeCursor, normalizePageSize } from "../shared/cursor";

/** Exact profile references are not earning approvals or cash payments. */
export class ExactEmployeeService {
  private readonly mutation: WorkspaceMutationContext;
  constructor(private readonly repository: ExactEmployeeRepository, private readonly dependencies: { id(): string; now(): string }, authorizer?: WorkspaceAdminAuthorizer) {
    this.mutation = new WorkspaceMutationContext(repository, authorizer);
  }

  listEmployees(filters?: EmployeeListFilters) { return { items: this.repository.listEmployees(filters) }; }

  deleteEmployee(id: string, context?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      this.mutation.createMutationAuditContext(context);
      this.getEmployee(id);
      if (this.repository.employeeHasPreservedEvidence(id)) throw new CompanyError("BUSINESS_RULE", "لا يمكن حذف العامل نهائيًا لأنه مرتبط بسجل عمل أو بإدارة قائمة. استخدم إنهاء بدلًا من ذلك.");
      this.repository.deleteEmployee(id);
      return deleteResult("تم حذف العامل نهائيًا بنجاح.");
    });
  }

  listEmployeesPaged(raw?: { roleId?: string; status?: "ACTIVE" | "INACTIVE" | "LEFT"; search?: string; cursor?: string; limit?: number }) {
    const input = employeePagedListInputSchema.parse(raw) ?? {};
    if (input.cursor) {
      try { decodeCursor(input.cursor); } catch { throw new CompanyError("VALIDATION", "Invalid employee cursor"); }
    }
    const result = this.repository.listEmployeesPaged({ filters: { roleId: input.roleId, status: input.status, search: input.search }, cursor: input.cursor, limit: normalizePageSize(input.limit) });
    return { ...result, hasMore: result.nextCursor !== null };
  }

  getEmployee(id: string) {
    const employee = this.repository.getEmployeeById(id);
    if (!employee) throw new CompanyError("NOT_FOUND", "تعذر العثور على العامل المطلوب.");
    return successResult("تم تحميل العامل بنجاح.", employee);
  }

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters) {
    return { items: this.repository.listEmployeeStateHistory(filters?.employeeId) };
  }

  saveEmployee(raw: ExactEmployeeSaveInput, context?: MutationAuditContext) {
    const input = exactEmployeeSaveInputSchema.parse(raw);
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(context);
      const { placement, managedProjectIds, managedWarehouseIds, ...profile } = input;
      const result = this.updateEmployee(profile, audit);
      const employee = result.item;
      const role = requireRole(this.repository, employee.roleId);
      if (employee.status === "ACTIVE" && role.key === LEGACY_WORKFORCE_ROLE_KEYS.worker) {
        if (placement) this.assignEmployeeWorkplace({ employeeId: input.id, ...placement }, audit);
        else {
          const links = this.repository.getEmployeeTransitionLinks(input.id);
          if (!links.hasActiveProjectAssignment && !links.hasActiveWarehouseAssignment) throw new CompanyError("BUSINESS_RULE", "اختر مكان عمل للعامل النشط (مشروع أو مستودع).", [{ field: "workplaceType", message: "اختر مكان عمل للعامل النشط (مشروع أو مستودع)." }]);
        }
      }
      if (employee.status === "ACTIVE" && role.key === LEGACY_WORKFORCE_ROLE_KEYS.projectManager && managedProjectIds !== undefined) this.syncManagedProjects({ employeeId: input.id, projectIds: managedProjectIds }, audit);
      if (employee.status === "ACTIVE" && role.key === LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager && managedWarehouseIds !== undefined) this.syncManagedWarehouses({ employeeId: input.id, warehouseIds: managedWarehouseIds }, audit);
      return result;
    });
  }

  syncManagedProjects(raw: EmployeeSyncManagedProjectsInput, context?: MutationAuditContext) {
    const input = employeeSyncManagedProjectsInputSchema.parse(raw);
    return this.syncManagedResources("PROJECT", input.employeeId, input.projectIds, context);
  }

  syncManagedWarehouses(raw: EmployeeSyncManagedWarehousesInput, context?: MutationAuditContext) {
    const input = employeeSyncManagedWarehousesInputSchema.parse(raw);
    return this.syncManagedResources("WAREHOUSE", input.employeeId, input.warehouseIds, context);
  }

  private syncManagedResources(kind: "PROJECT" | "WAREHOUSE", employeeId: string, ids: readonly string[], context?: MutationAuditContext) {
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(context);
      const employee = this.getEmployee(employeeId).item;
      const expected = kind === "PROJECT" ? LEGACY_WORKFORCE_ROLE_KEYS.projectManager : LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager;
      if (requireRole(this.repository, employee.roleId).key !== expected || employee.status !== "ACTIVE") throw new CompanyError("BUSINESS_RULE", "يجب أن يكون المدير نشطًا ويحمل الدور المطلوب.", [{ field: "employeeId", message: "يجب أن يكون المدير نشطًا ويحمل الدور المطلوب." }]);
      const field = kind === "PROJECT" ? "projectIds" : "warehouseIds";
      for (const id of ids) {
        const resource = this.repository.getWorkplaceResource(kind, id);
        if (!resource) throw new CompanyError("NOT_FOUND", "تعذر العثور على موقع العمل المطلوب.", [{ field, message: "تعذر العثور على موقع العمل المطلوب." }]);
        if ((resource.status !== "ACTIVE" && resource.managerId !== employeeId) || (resource.managerId !== null && resource.managerId !== employeeId)) throw new CompanyError("BUSINESS_RULE", "يجب اختيار موقع عمل نشط غير مرتبط بمدير آخر.", [{ field, message: "يجب اختيار موقع عمل نشط غير مرتبط بمدير آخر." }]);
      }
      const selected = new Set(ids);
      for (const resource of this.repository.listManagedResources(kind, employeeId)) {
        if (!selected.has(resource.id) && this.repository.managedResourceHasDependentAssignments(kind, resource.id)) throw new CompanyError("BUSINESS_RULE", "لا يمكن إزالة المدير مع وجود عاملين مرتبطين بموقع العمل.", [{ field: "managerId", message: "لا يمكن إزالة المدير مع وجود عاملين مرتبطين بموقع العمل." }]);
      }
      this.repository.syncManagedResources(kind, employeeId, ids, audit, this.dependencies.now());
      return deleteResult(kind === "PROJECT" ? "تم تحديث المشاريع المُدارة بنجاح." : "تم تحديث المستودعات المُدارة بنجاح.");
    });
  }

  assignEmployeeWorkplace(raw: EmployeeAssignWorkplaceInput, context?: MutationAuditContext) {
    const input = employeeAssignWorkplaceInputSchema.parse(raw);
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(context);
      const employee = this.getEmployee(input.employeeId).item;
      const role = requireRole(this.repository, employee.roleId);
      if (employee.status !== "ACTIVE") throw new CompanyError("BUSINESS_RULE", "لا يمكن تعديل مكان العمل إلا لعامل نشط.");
      if (role.key !== LEGACY_WORKFORCE_ROLE_KEYS.worker) throw new CompanyError("BUSINESS_RULE", "تغيير مكان العمل المباشر متاح للعمال فقط من هذه العملية.");
      if (input.nextType === "PROJECT") {
        if (!input.managerId) throw new CompanyError("VALIDATION", "يجب اختيار مدير المشروع أولًا.", [{ field: "managerId", message: "يجب اختيار مدير المشروع أولًا." }]);
        const manager = this.getEmployee(input.managerId).item;
        if (requireRole(this.repository, manager.roleId).key !== LEGACY_WORKFORCE_ROLE_KEYS.projectManager || manager.status !== "ACTIVE") throw new CompanyError("BUSINESS_RULE", "المدير المختار يجب أن يحمل دور مدير مشروع نشط.", [{ field: "managerId", message: "المدير المختار يجب أن يحمل دور مدير مشروع نشط." }]);
        if (!input.projectId) throw new CompanyError("VALIDATION", "يجب اختيار مشروع صالح.", [{ field: "projectId", message: "يجب اختيار مشروع صالح." }]);
        const project = this.repository.getWorkplaceResource("PROJECT", input.projectId);
        if (!project) throw new CompanyError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.");
        if (project.status !== "ACTIVE" || project.managerId !== manager.id) throw new CompanyError("BUSINESS_RULE", "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.", [{ field: "projectId", message: "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل." }]);
      }
      if (input.nextType === "WAREHOUSE") {
        if (!input.warehouseId) throw new CompanyError("VALIDATION", "يجب اختيار مستودع صالح.", [{ field: "warehouseId", message: "يجب اختيار مستودع صالح." }]);
        const warehouse = this.repository.getWorkplaceResource("WAREHOUSE", input.warehouseId);
        if (!warehouse) throw new CompanyError("NOT_FOUND", "تعذر العثور على المستودع المطلوب.");
        if (warehouse.status !== "ACTIVE") throw new CompanyError("BUSINESS_RULE", "لا يمكن ربط العامل إلا بمستودع نشط.", [{ field: "warehouseId", message: "لا يمكن ربط العامل إلا بمستودع نشط." }]);
      }
      this.repository.assignEmployeeWorkplace({ ...input, notes: normalizeText(input.notes) }, audit, this.dependencies.now());
      return deleteResult("تم تحديث مكان العمل بنجاح.");
    });
  }

  updateEmployee(raw: ExactEmployeeUpdateInput, context?: MutationAuditContext) {
    const input = exactEmployeeUpdateInputSchema.parse(raw);
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(context);
      const current = this.getEmployee(input.id).item;
      const currentRole = requireRole(this.repository, current.roleId);
      const nextRole = input.roleId ? requireAssignableEmployeeRole(this.repository, input.roleId, "roleId", { authorizer: this.mutation.adminAuthorizer, actorUserId: audit.actorUserId }) : currentRole;
      const nextStatus = input.status ?? current.status;
      if (nextRole.key !== currentRole.key || nextStatus !== "ACTIVE") {
        assertEmployeeTransitionAllowed(currentRole.key, nextRole.key, nextStatus, this.repository.getEmployeeTransitionLinks(input.id));
      }
      if (input.phone && input.phone !== current.phone) {
        const duplicate = this.repository.getEmployeeByPhone(input.phone);
        if (duplicate && duplicate.id !== current.id) throw new CompanyError("CONFLICT", "رقم هاتف العامل مستخدم بالفعل.", [{ field: "phone", message: "رقم هاتف العامل مستخدم بالفعل." }]);
      }
      if (current.status !== "ACTIVE" && nextStatus === "ACTIVE") assertActiveEmployeeSeatAvailable(this.repository);
      const employee = this.repository.updateEmployee({
        ...current, firstName: input.firstName ?? current.firstName, lastName: input.lastName ?? current.lastName,
        phone: input.phone ?? current.phone, roleId: nextRole.id, status: nextStatus,
        salaryReference: input.salaryReference === undefined ? current.salaryReference : input.salaryReference,
        notes: input.notes === undefined ? current.notes : normalizeText(input.notes),
        occupation: input.occupation === undefined ? current.occupation : normalizeText(input.occupation), updatedAt: this.dependencies.now(),
      }, audit);
      return successResult("تم تحديث بيانات العامل بنجاح.", employee!);
    });
  }

  createEmployeesBatch(raw: ExactEmployeeBatchCreateInput, context?: MutationAuditContext) {
    const input = exactEmployeeBatchCreateInputSchema.parse(raw);
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(context);
      const errors: { field: string; message: string }[] = [];
      let adminError: CompanyError | undefined;
      input.employees.forEach((employee, index) => {
        const error = (field: string, message: string) => errors.push({ field: `employees.${index}.${field}`, message });
        let role;
        try { role = requireAssignableEmployeeRole(this.repository, employee.roleId, "roleId", { authorizer: this.mutation.adminAuthorizer, actorUserId: audit.actorUserId }); }
        catch (failure) {
          if (!(failure instanceof CompanyError)) throw failure;
          if (failure.appError.code === "UNAUTHORIZED") adminError ??= new CompanyError("UNAUTHORIZED", failure.message, [{ field: `employees.${index}.roleId`, message: failure.message }]);
          else error("roleId", failure.message);
        }
        if (this.repository.getEmployeeByPhone(employee.phone)) error("phone", "رقم هاتف العامل مستخدم بالفعل.");
        if (role?.key !== LEGACY_WORKFORCE_ROLE_KEYS.worker) {
          if (employee.managerId) error("managerId", "يمكن تعيين مدير مباشر للعمال فقط.");
          if (employee.projectId) error("projectId", "اختيار المشروع في هذا النموذج متاح للعمال فقط.");
          return;
        }
        if (employee.status !== "ACTIVE" && (employee.managerId || employee.projectId)) {
          error(employee.projectId ? "projectId" : "managerId", "لا يمكن ربط عامل غير نشط بمدير أو مشروع نشط.");
          return;
        }
        if (employee.status === "ACTIVE" && !employee.managerId) error("managerId", "اختيار المدير المباشر مطلوب للعامل النشط.");
        if (employee.status === "ACTIVE" && !employee.projectId) error("projectId", "اختيار المشروع مطلوب للعامل النشط.");
        if (!employee.managerId) return;
        const manager = this.repository.getEmployeeById(employee.managerId);
        if (!manager) { error("managerId", "تعذر العثور على المدير المطلوب."); return; }
        if (this.repository.getRoleById(manager.roleId)?.key !== LEGACY_WORKFORCE_ROLE_KEYS.projectManager) error("managerId", "المدير المختار يجب أن يحمل دور مدير مشروع نشط.");
        if (manager.status !== "ACTIVE") error("managerId", "المدير المختار يجب أن يكون نشطًا.");
        if (!employee.projectId) return;
        const project = this.repository.getWorkplaceResource("PROJECT", employee.projectId);
        if (!project) { error("projectId", "تعذر العثور على المشروع المطلوب."); return; }
        if (project.status !== "ACTIVE") error("projectId", "يمكن اختيار مشروع نشط فقط.");
        if (project.managerId !== employee.managerId) error("projectId", "يجب أن يكون المشروع ضمن المشاريع التي يديرها المدير المختار.");
      });
      if (adminError) throw adminError;
      if (errors.length) throw new CompanyError("VALIDATION", "تعذر حفظ دفعة العاملين. راجع الحقول المعلّمة ثم حاول مرة أخرى.", errors);
      assertActiveEmployeeSeatAvailable(this.repository, input.employees.filter(employee => employee.status === "ACTIVE").length);
      const employees = input.employees.map(({ managerId: _manager, projectId: _project, ...employee }) => this.createEmployee(employee, audit).item);
      const managerAssignments = [] as ReturnType<ExactEmployeeRepository["listEmployeeCreatedRelationships"]>["managerAssignments"];
      const projectAssignments = [] as ReturnType<ExactEmployeeRepository["listEmployeeCreatedRelationships"]>["projectAssignments"];
      input.employees.forEach((employee, index) => {
        if (employee.managerId && employee.projectId) {
          this.assignEmployeeWorkplace({ employeeId: employees[index]!.id, nextType: "PROJECT", managerId: employee.managerId, projectId: employee.projectId, notes: employee.notes }, audit);
          const relationships = this.repository.listEmployeeCreatedRelationships(employees[index]!.id);
          managerAssignments.push(...relationships.managerAssignments);
          projectAssignments.push(...relationships.projectAssignments);
        }
      });
      return successResult("تم إنشاء دفعة العاملين بنجاح.", { employees, managerAssignments, projectAssignments });
    });
  }

  createEmployee(raw: ExactEmployeeCreateInput, context?: MutationAuditContext) {
    const input = exactEmployeeCreateInputSchema.parse(raw);
    return this.mutation.withTransaction(() => {
      const audit = this.mutation.createMutationAuditContext(context);
      requireAssignableEmployeeRole(this.repository, input.roleId, "roleId", { authorizer: this.mutation.adminAuthorizer, actorUserId: audit.actorUserId });
      if (this.repository.getEmployeeByPhone(input.phone)) throw new CompanyError("CONFLICT", "رقم هاتف العامل مستخدم بالفعل.", [{ field: "phone", message: "رقم هاتف العامل مستخدم بالفعل." }]);
      if (input.status === "ACTIVE") assertActiveEmployeeSeatAvailable(this.repository);
      const timestamp = this.dependencies.now();
      const employee = this.repository.createEmployee({
        id: this.dependencies.id(), firstName: input.firstName, lastName: input.lastName, phone: input.phone,
        roleId: input.roleId, status: input.status, salaryReference: input.salaryReference ?? null, currency: "DZD",
        notes: normalizeText(input.notes), occupation: normalizeText(input.occupation), createdAt: timestamp, updatedAt: timestamp,
      }, audit);
      return successResult("تم إنشاء العامل بنجاح.", employee);
    });
  }
}
