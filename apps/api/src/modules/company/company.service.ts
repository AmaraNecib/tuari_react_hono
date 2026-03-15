import {
  type EmployeeCreateInput,
  type EmployeeUpdateInput,
  type ManagerAssignmentCreateInput,
  type ManagerAssignmentEndInput,
  type ProjectAssignmentCreateInput,
  type ProjectAssignmentEndInput,
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
  type EmployeeListFilters,
  type ManagerAssignmentListFilters,
  type ProjectAssignmentListFilters,
  type ProjectListFilters,
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

function normalizeTimestamp(value: string | undefined) {
  return value ?? new Date().toISOString();
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

  createRole(input: RoleCreateInput) {
    if (this.repository.getRoleByKey(input.key)) {
      throw new CompanyError("CONFLICT", "مفتاح الدور موجود مسبقًا.", [
        { field: "key", message: "مفتاح الدور موجود مسبقًا." },
      ]);
    }

    const role = this.repository.createRole({
      key: input.key,
      name: input.name.trim(),
      description: normalizeText(input.description),
    });

    return successResult("تم إنشاء الدور بنجاح.", role);
  }

  updateRole(input: RoleUpdateInput) {
    const current = this.repository.getRoleById(input.id);
    if (!current) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الدور المطلوب.");
    }

    if (current.isSystem && input.key && input.key !== current.key) {
      throw new CompanyError("BUSINESS_RULE", "لا يمكن تعديل مفتاح الدور الأساسي.", [
        { field: "key", message: "لا يمكن تعديل مفتاح الدور الأساسي." },
      ]);
    }

    if (input.key && input.key !== current.key && this.repository.getRoleByKey(input.key)) {
      throw new CompanyError("CONFLICT", "مفتاح الدور موجود مسبقًا.", [
        { field: "key", message: "مفتاح الدور موجود مسبقًا." },
      ]);
    }

    const role = this.repository.updateRole({
      id: input.id,
      key: input.key,
      name: input.name?.trim(),
      description: input.description !== undefined ? normalizeText(input.description) : undefined,
    });

    return successResult("تم تحديث الدور بنجاح.", role!);
  }

  deleteRole(id: string) {
    const current = this.repository.getRoleById(id);
    if (!current) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الدور المطلوب.");
    }

    if (current.isSystem) {
      throw new CompanyError("BUSINESS_RULE", "لا يمكن حذف الأدوار الأساسية.");
    }

    if (this.repository.countEmployeesByRoleId(id) > 0) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "لا يمكن حذف هذا الدور ما دام مستخدمًا من قبل عاملين.",
      );
    }

    this.repository.deleteRole(id);
    return deleteResult("تم حذف الدور بنجاح.");
  }

  listEmployees(filters?: EmployeeListFilters) {
    return { items: this.repository.listEmployees(filters) };
  }

  getEmployee(id: string) {
    const employee = this.requireEmployee(id);
    return successResult("تم تحميل العامل بنجاح.", employee);
  }

  createEmployee(input: EmployeeCreateInput) {
    this.requireRole(input.roleId);

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
      notes: normalizeText(input.notes),
    });

    return successResult("تم إنشاء العامل بنجاح.", employee);
  }

  updateEmployee(input: EmployeeUpdateInput) {
    const current = this.requireEmployee(input.id);
    const currentRole = this.requireRole(current.roleId);
    const nextRole = input.roleId ? this.requireRole(input.roleId) : currentRole;
    const nextStatus = input.status ?? current.status;

    this.ensureEmployeeTransitionAllowed(current, currentRole.key, nextRole.key, nextStatus);

    if (input.phone && input.phone !== current.phone) {
      const existing = this.repository.getEmployeeByPhone(input.phone.trim());
      if (existing && existing.id !== input.id) {
        throw new CompanyError("CONFLICT", "رقم هاتف العامل مستخدم بالفعل.", [
          { field: "phone", message: "رقم هاتف العامل مستخدم بالفعل." },
        ]);
      }
    }

    const employee = this.repository.updateEmployee({
      id: input.id,
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      phone: input.phone?.trim(),
      roleId: input.roleId,
      status: input.status,
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    });

    return successResult("تم تحديث بيانات العامل بنجاح.", employee!);
  }

  listProjects(filters?: ProjectListFilters) {
    return { items: this.repository.listProjects(filters) };
  }

  getProject(id: string) {
    return successResult("تم تحميل المشروع بنجاح.", this.requireProject(id));
  }

  createProject(input: ProjectCreateInput) {
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
    });

    return successResult("تم إنشاء المشروع بنجاح.", project);
  }

  updateProject(input: ProjectUpdateInput) {
    const current = this.requireProject(input.id);

    this.ensureProjectTransitionAllowed(current.id, current.managerId, input.managerId, input.status);

    if (input.managerId) {
      this.requireActiveEmployee(
        this.requireEmployeeWithRoleKey(input.managerId, SYSTEM_ROLE_KEYS.projectManager, "managerId"),
        "managerId",
      );
    }

    const project = this.repository.updateProject({
      id: input.id,
      name: input.name?.trim(),
      location: input.location !== undefined ? normalizeText(input.location) : undefined,
      managerId: input.managerId,
      status: input.status,
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    });

    return successResult("تم تحديث المشروع بنجاح.", project!);
  }

  listWarehouses(filters?: WarehouseListFilters) {
    return { items: this.repository.listWarehouses(filters) };
  }

  getWarehouse(id: string) {
    return successResult("تم تحميل المستودع بنجاح.", this.requireWarehouse(id));
  }

  createWarehouse(input: WarehouseCreateInput) {
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
    });

    return successResult("تم إنشاء المستودع بنجاح.", warehouse);
  }

  updateWarehouse(input: WarehouseUpdateInput) {
    this.requireWarehouse(input.id);

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

    const warehouse = this.repository.updateWarehouse({
      id: input.id,
      name: input.name?.trim(),
      address: input.address !== undefined ? normalizeText(input.address) : undefined,
      managerId: input.managerId,
      status: input.status,
      notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
    });

    return successResult("تم تحديث المستودع بنجاح.", warehouse!);
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

  createManagerAssignment(input: ManagerAssignmentCreateInput) {
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
    });

    return successResult("تم إنشاء ربط المدير بنجاح.", assignment);
  }

  endManagerAssignment(input: ManagerAssignmentEndInput) {
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
    });

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

  createProjectAssignment(input: ProjectAssignmentCreateInput) {
    const employee = this.requireEmployee(input.employeeId);
    const project = this.requireProject(input.projectId);

    if (input.status === "ACTIVE") {
      this.requireActiveEmployee(employee, "employeeId");

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
    });

    return successResult("تم إنشاء ربط المشروع بنجاح.", assignment);
  }

  endProjectAssignment(input: ProjectAssignmentEndInput) {
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
    });

    return successResult("تم إنهاء ربط المشروع بنجاح.", assignment!);
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

    if (
      currentRoleKey === SYSTEM_ROLE_KEYS.worker &&
      (nextRoleKey !== SYSTEM_ROLE_KEYS.worker || nextStatus !== "ACTIVE") &&
      (hasActiveManagerAssignment || hasActiveProjectAssignment)
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

      if (hasActiveManagedProjects || hasActiveWorkers) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين.",
          [
            {
              field: "status",
              message: "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين.",
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

      if (hasActiveWarehouses) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تغيير حالة مدير المخزن أو دوره ما دام يدير مستودعات نشطة.",
          [
            {
              field: "status",
              message: "لا يمكن تغيير حالة مدير المخزن أو دوره ما دام يدير مستودعات نشطة.",
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

    const managerWillChange = nextManagerId !== undefined && nextManagerId !== currentManagerId
    const projectWillDeactivate = nextStatus !== undefined && nextStatus !== "ACTIVE"

    if (managerWillChange || projectWillDeactivate) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "لا يمكن تعديل مدير المشروع أو حالته مع وجود عمال مرتبطين بمشروع نشط.",
        [
          {
            field: managerWillChange ? "managerId" : "status",
            message: "لا يمكن تعديل مدير المشروع أو حالته مع وجود عمال مرتبطين بمشروع نشط.",
          },
        ],
      )
    }
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
