import {
  type DebtAccountCreateInput,
  type DebtPartyDetailInput,
  type DebtEntryCreateInput,
  type DebtSettlementInput,
  type EmployeeBatchCreateInput,
  type EmployeeAssignWorkplaceInput,
  type EmployeeCreateInput,
  type EmployeeSyncManagedProjectsInput,
  type EmployeeSyncManagedWarehousesInput,
  type EmployeeSalaryPaymentCreateInput,
  type EmployeeUpdateInput,
  type ExternalCounterpartyCreateInput,
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
import { TransactionManager } from "./transaction-manager";
import type {
  WorkspaceAdminAuthorizer,
} from "./company.helpers";
import {
  assertDebtEntryDateNotBackdated,
  buildBatchField,
  buildDebtPartyKey,
  deleteResult,
  getDebtAccountStatus,
  getDebtBalanceLabel,
  normalizeMutationAuditContext,
  normalizeSalaryAmount,
  normalizeSignedMoneyAmount,
  normalizeText,
  successResult,
} from "./company.helpers";
import type { CompanyRepository } from "./company.repository";
import { buildCompanySystemLog } from "./company.system-log";
import { normalizeAlgeriaTimestamp } from "./company-time";
import {
  SYSTEM_ROLE_KEYS,
  type DebtAccountRecord,
  type EmployeeSalaryPaymentListFilters,
  type EmployeeStateHistoryListFilters,
  type EmployeeListFilters,
  type ExternalCounterpartyListFilters,
  type ManagerAssignmentListFilters,
  type DebtAccountListFilters,
  type DebtEntryListFilters,
  type ProjectManagerOwnershipHistoryListFilters,
  type ProjectAssignmentListFilters,
  type ProjectListFilters,
  type MutationAuditContext,
  type SystemLogListFilters,
  type WarehouseAssignmentListFilters,
  type WarehouseManagerOwnershipHistoryListFilters,
  type WarehouseListFilters,
} from "./company.types";

export class CompanyService {
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly repository: CompanyRepository,
    private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer,
  ) {
    this.transactionManager = new TransactionManager(repository);
  }

  private createMutationAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
    const audit = normalizeMutationAuditContext(auditContext)

    if (!this.workspaceAdminAuthorizer) {
      return audit
    }

    if (!audit.actorUserId || !this.workspaceAdminAuthorizer.isBootstrapOwner(audit.actorUserId)) {
      throw new CompanyError("UNAUTHORIZED", "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.")
    }

    return audit
  }

  private withTransaction<T>(operation: () => T): T {
    return this.transactionManager.execute(operation);
  }

  listRoles() {
    return { items: this.repository.listRoles() };
  }

  getWorkspaceSnapshot() {
    return {
      roles: this.repository.listRoles(),
      employees: this.repository.listEmployees(),
      externalCounterparties: this.repository.listExternalCounterparties(),
      debtAccounts: this.repository.listDebtAccounts(),
      debtEntries: this.repository.listAllDebtEntries(),
      projects: this.repository.listProjects(),
      warehouses: this.repository.listWarehouses(),
      managerAssignments: this.repository.listManagerAssignments(),
      projectAssignments: this.repository.listProjectAssignments(),
      warehouseAssignments: this.repository.listWarehouseAssignments(),
      employeeStateHistory: this.repository.listEmployeeStateHistory(),
      projectManagerOwnershipHistory: this.repository.listProjectManagerOwnershipHistory(),
      warehouseManagerOwnershipHistory: this.repository.listWarehouseManagerOwnershipHistory(),
      salaryPayments: this.repository.listSalaryPayments(),
    }
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

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters) {
    return { items: this.repository.listExternalCounterparties(filters) }
  }

  getExternalCounterparty(id: string) {
    const counterparty = this.repository.getExternalCounterpartyById(id)
    if (!counterparty) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الطرف الخارجي المطلوب.")
    }

    return successResult("تم تحميل الطرف الخارجي بنجاح.", counterparty)
  }

  createExternalCounterparty(input: ExternalCounterpartyCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      this.createMutationAuditContext(auditContext)

      const counterparty = this.repository.createExternalCounterparty({
        fullName: input.fullName.trim(),
        phoneNumber: input.phoneNumber.trim(),
        note: normalizeText(input.note),
      })

      return successResult("تم إنشاء الطرف الخارجي بنجاح.", counterparty)
    });
  }

  listDebtAccounts(filters?: DebtAccountListFilters) {
    return { items: this.repository.listDebtAccounts(filters) }
  }

  getDebtAccount(id: string) {
    const account = this.repository.getDebtAccountById(id)
    if (!account) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على حساب الدين المطلوب.")
    }

    return successResult("تم تحميل حساب الدين بنجاح.", account)
  }

  listDebtEntries(filters: DebtEntryListFilters) {
    this.requireDebtAccount(filters.debtAccountId)
    return { items: this.repository.listDebtEntries(filters) }
  }

  createDebtAccount(input: DebtAccountCreateInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)

    const workerId = input.workerId ?? null
    const externalCounterpartyId = input.externalCounterpartyId ?? null

    if ((workerId === null && externalCounterpartyId === null) || (workerId !== null && externalCounterpartyId !== null)) {
      throw new CompanyError("VALIDATION", "يجب ربط الحساب بطرف واحد فقط.", [
        { field: workerId !== null ? "externalCounterpartyId" : "workerId", message: "يجب ربط الحساب بطرف واحد فقط." },
      ])
    }

    if (input.partyType === "INTERNAL_WORKER") {
      this.requireEmployeeWorker(workerId!, "workerId")
    }

    if (input.partyType === "EXTERNAL_COUNTERPARTY") {
      this.requireExternalCounterparty(externalCounterpartyId!, "externalCounterpartyId")
    }

    const openingBalance = input.openingBalanceDzd ?? 0
    if (!Number.isFinite(openingBalance)) {
      throw new CompanyError("VALIDATION", "يجب إدخال رصيد افتتاحي صالح.", [
        { field: "openingBalanceDzd", message: "يجب إدخال رصيد افتتاحي صالح." },
      ])
    }
    const entryDate = normalizeAlgeriaTimestamp(input.openingEntryDate)

    const existingAccount = input.partyType === "INTERNAL_WORKER"
      ? this.repository.getDebtAccountByWorkerId(workerId!)
      : (input.direction === "RECEIVABLE"
          ? this.repository.getDebtAccountByExternalCounterpartyIdAndDirection(externalCounterpartyId!, "RECEIVABLE")
          : this.repository.getDebtAccountByExternalCounterpartyIdAndDirection(externalCounterpartyId!, "PAYABLE"))

    if (existingAccount) {
      if (openingBalance !== 0) {
        this.createDebtEntry(
          {
            debtAccountId: existingAccount.id,
            entryType: "ADJUSTMENT",
            signedAmountDzd: openingBalance,
            entryDate,
            note: normalizeText(input.openingEntryNote) ?? normalizeText(input.note),
          },
          audit,
        )
      }

      return successResult("تم تحديث حساب الدين الحالي بنجاح.", this.requireDebtAccount(existingAccount.id))
    }

    const status = getDebtAccountStatus(openingBalance)
    const account = this.repository.withTransaction(() => {
      const createdAccount = this.repository.createDebtAccount(
        {
          partyType: input.partyType,
          workerId,
          externalCounterpartyId,
          direction: input.direction ?? "PAYABLE",
          status,
          currentBalance: openingBalance,
          note: normalizeText(input.note),
          settledAt: status === "SETTLED" ? entryDate : null,
        },
        audit,
      )

      if (openingBalance !== 0) {
        this.repository.createDebtEntry(
          {
            debtAccountId: createdAccount.id,
            entryType: "OPENING",
            signedAmountDzd: openingBalance,
            entryDate,
            note: normalizeText(input.openingEntryNote) ?? normalizeText(input.note),
            balanceAfterDzd: openingBalance,
          },
          audit,
        )
      }

      return createdAccount
    })

    return successResult("تم إنشاء حساب الدين بنجاح.", this.requireDebtAccount(account.id))
  }

  createDebtEntry(input: DebtEntryCreateInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)
    const account = this.requireDebtAccount(input.debtAccountId)
    const latestEntry = this.repository.getLatestDebtEntry(account.id)

    if (input.entryType === "OPENING" && latestEntry !== null) {
      throw new CompanyError("BUSINESS_RULE", "يمكن تسجيل رصيد افتتاحي فقط كأول حركة على الحساب.", [
        { field: "entryType", message: "يمكن تسجيل رصيد افتتاحي فقط كأول حركة على الحساب." },
      ])
    }

    const signedAmountDzd = normalizeSignedMoneyAmount(input.signedAmountDzd)
    const entryDate = normalizeAlgeriaTimestamp(input.entryDate)
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate ?? null, "entryDate")
    const nextBalance = account.currentBalance + signedAmountDzd
    const nextStatus = getDebtAccountStatus(nextBalance)

    const entry = this.repository.withTransaction(() => {
      const createdEntry = this.repository.createDebtEntry(
        {
          debtAccountId: account.id,
          entryType: input.entryType,
          signedAmountDzd,
          entryDate,
          note: normalizeText(input.note),
          balanceAfterDzd: nextBalance,
        },
        audit,
      )

      this.repository.updateDebtAccount(
        {
          id: account.id,
          currentBalance: nextBalance,
          status: nextStatus,
          settledAt: nextStatus === "SETTLED" ? entryDate : null,
        },
        audit,
      )

      return createdEntry
    })

    return successResult("تم تسجيل حركة الدين بنجاح.", entry)
  }

  settleDebtAccount(input: DebtSettlementInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)
    const account = this.requireDebtAccount(input.id)

    if (account.currentBalance === 0) {
      throw new CompanyError("BUSINESS_RULE", "الحساب مسوّى بالفعل ولا يحتاج إلى تسوية جديدة.")
    }

    const entryDate = normalizeAlgeriaTimestamp(input.entryDate)
    const latestEntry = this.repository.getLatestDebtEntry(account.id)
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate ?? null, "entryDate")
    const settlementAmount = -account.currentBalance
    const entry = this.repository.withTransaction(() => {
      const createdEntry = this.repository.createDebtEntry(
        {
          debtAccountId: account.id,
          entryType: "SETTLEMENT",
          signedAmountDzd: settlementAmount,
          entryDate,
          note: normalizeText(input.note),
          balanceAfterDzd: 0,
        },
        audit,
      )

      this.repository.updateDebtAccount(
        {
          id: account.id,
          currentBalance: 0,
          status: "SETTLED",
          settledAt: entryDate,
        },
        audit,
      )

      return createdEntry
    })

    return successResult("تمت تسوية حساب الدين بنجاح.", entry)
  }

  getDebtPartyDetail(input: DebtPartyDetailInput) {
    if (input.partyType === "INTERNAL_WORKER") {
      const employee = this.requireEmployeeWorker(input.workerId!, "workerId")
      const debtAccounts = this.repository.listDebtAccounts({ workerId: employee.id })
      const totalBalanceDzd = debtAccounts.reduce((sum, account) => sum + account.currentBalance, 0)
      return successResult("تم تحميل تفاصيل ديون العامل بنجاح.", {
        partyType: "INTERNAL_WORKER" as const,
        workerId: employee.id,
        externalCounterpartyId: null,
        displayName: `${employee.firstName} ${employee.lastName}`,
        phoneNumber: employee.phone,
        note: employee.notes,
        totalBalanceDzd,
        balanceLabel: getDebtBalanceLabel(totalBalanceDzd),
        debtAccounts,
      })
    }

    const counterparty = this.requireExternalCounterparty(input.externalCounterpartyId!, "externalCounterpartyId")
    const debtAccounts = this.repository.listDebtAccounts({ externalCounterpartyId: counterparty.id })
    const totalBalanceDzd = debtAccounts.reduce((sum, account) => sum + account.currentBalance, 0)
    return successResult("تم تحميل تفاصيل ديون الطرف الخارجي بنجاح.", {
      partyType: "EXTERNAL_COUNTERPARTY" as const,
      workerId: null,
      externalCounterpartyId: counterparty.id,
      displayName: counterparty.fullName,
      phoneNumber: counterparty.phoneNumber,
      note: counterparty.note,
      totalBalanceDzd,
      balanceLabel: getDebtBalanceLabel(totalBalanceDzd),
      debtAccounts,
    })
  }

  listDebtsSummary() {
    const allDebtAccounts = this.repository.listDebtAccounts()
    const employeesById = new Map(this.repository.listEmployees().map((employee) => [employee.id, employee]))
    const counterpartiesById = new Map(
      this.repository.listExternalCounterparties().map((counterparty) => [counterparty.id, counterparty]),
    )

    const debtAccounts = allDebtAccounts.map((account) => {
        const employee = account.workerId ? employeesById.get(account.workerId) : null
        const counterparty = account.externalCounterpartyId
          ? counterpartiesById.get(account.externalCounterpartyId)
          : null

        return {
          accountId: account.id,
          partyType: account.partyType,
          workerId: account.workerId,
          externalCounterpartyId: account.externalCounterpartyId,
          displayName: employee ? `${employee.firstName} ${employee.lastName}` : counterparty?.fullName ?? account.id,
          phoneNumber: employee?.phone ?? counterparty?.phoneNumber ?? null,
          status: account.status,
          direction: account.direction,
          currentBalance: account.currentBalance,
          balanceLabel: getDebtBalanceLabel(account.currentBalance),
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        }
      })

    const partyMap = new Map<string, {
      partyType: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY"
      workerId: string | null
      externalCounterpartyId: string | null
      displayName: string
      phoneNumber: string | null
      totalBalanceDzd: number
      openDebtCasesCount: number
      settledDebtCasesCount: number
      latestActivityAt: string
    }>()

    for (const account of allDebtAccounts) {
      const key = buildDebtPartyKey(account)
      const employee = account.workerId ? employeesById.get(account.workerId) : null
      const counterparty = account.externalCounterpartyId ? counterpartiesById.get(account.externalCounterpartyId) : null
      const current = partyMap.get(key)
      const nextLatestActivityAt = current
        ? Date.parse(current.latestActivityAt) > Date.parse(account.updatedAt)
          ? current.latestActivityAt
          : account.updatedAt
        : account.updatedAt

      partyMap.set(key, {
        partyType: account.partyType,
        workerId: account.workerId,
        externalCounterpartyId: account.externalCounterpartyId,
        displayName: employee ? `${employee.firstName} ${employee.lastName}` : counterparty?.fullName ?? account.id,
        phoneNumber: employee?.phone ?? counterparty?.phoneNumber ?? null,
        totalBalanceDzd: (current?.totalBalanceDzd ?? 0) + account.currentBalance,
        openDebtCasesCount: (current?.openDebtCasesCount ?? 0) + (account.status === "OPEN" ? 1 : 0),
        settledDebtCasesCount: (current?.settledDebtCasesCount ?? 0) + (account.status === "SETTLED" ? 1 : 0),
        latestActivityAt: nextLatestActivityAt,
      })
    }

    const parties = Array.from(partyMap.values())
      .map((party) => ({
        ...party,
        balanceLabel: getDebtBalanceLabel(party.totalBalanceDzd),
      }))
      .sort((left, right) => Date.parse(right.latestActivityAt) - Date.parse(left.latestActivityAt))

    return { parties, debtAccounts }
  }

  listSystemLog(filters?: SystemLogListFilters) {
    return buildCompanySystemLog(this.repository, filters)
  }

  getEmployee(id: string) {
    const employee = this.requireEmployee(id);
    return successResult("تم تحميل العامل بنجاح.", employee);
  }

  createEmployee(input: EmployeeCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  createEmployeesBatch(input: EmployeeBatchCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  updateEmployee(input: EmployeeUpdateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  deleteEmployee(id: string, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      this.createMutationAuditContext(auditContext)

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
    });
  }

  listProjects(filters?: ProjectListFilters) {
    return { items: this.repository.listProjects(filters) };
  }

  getProject(id: string) {
    return successResult("تم تحميل المشروع بنجاح.", this.requireProject(id));
  }

  createProject(input: ProjectCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  updateProject(input: ProjectUpdateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  listWarehouses(filters?: WarehouseListFilters) {
    return { items: this.repository.listWarehouses(filters) };
  }

  getWarehouse(id: string) {
    return successResult("تم تحميل المستودع بنجاح.", this.requireWarehouse(id));
  }

  createWarehouse(input: WarehouseCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  updateWarehouse(input: WarehouseUpdateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
    });
  }

  assignEmployeeWorkplace(input: EmployeeAssignWorkplaceInput, auditContext?: MutationAuditContext) {
    const audit = this.createMutationAuditContext(auditContext)

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
    const audit = this.createMutationAuditContext(auditContext)

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
    const audit = this.createMutationAuditContext(auditContext)

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
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
        startDate: normalizeAlgeriaTimestamp(input.startDate),
        endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
        notes: normalizeText(input.notes),
      }, audit);

      return successResult("تم إنشاء ربط المدير بنجاح.", assignment);
    });
  }

  endManagerAssignment(input: ManagerAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
        endDate: normalizeAlgeriaTimestamp(input.endDate),
        notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
      }, audit);

      return successResult("تم إنهاء ربط المدير بنجاح.", assignment!);
    });
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
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
        startDate: normalizeAlgeriaTimestamp(input.startDate),
        endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
        notes: normalizeText(input.notes),
      }, audit);

      return successResult("تم إنشاء ربط المشروع بنجاح.", assignment);
    });
  }

  endProjectAssignment(input: ProjectAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

      const current = this.repository.getProjectAssignmentById(input.id);
      if (!current) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المشروع.");
      }

      if (current.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المشاريع النشطة فقط.");
      }

      const assignment = this.repository.endProjectAssignment({
        id: input.id,
        endDate: normalizeAlgeriaTimestamp(input.endDate),
        notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
      }, audit);

      return successResult("تم إنهاء ربط المشروع بنجاح.", assignment!);
    });
  }

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters) {
    return { items: this.repository.listWarehouseAssignments(filters) };
  }

  createSalaryPayment(input: EmployeeSalaryPaymentCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

      const employee = this.requireEmployee(input.employeeId)
      const expectedAmount = employee.salaryAmountDzd ?? null
      const periodType = employee.salaryPeriod ?? null

      if (expectedAmount === null || periodType === null) {
        throw new CompanyError("BUSINESS_RULE", "يجب تحديد أجر العامل الحالي قبل تسجيل دفعة راتب.", [
          { field: "employeeId", message: "يجب تحديد أجر العامل الحالي قبل تسجيل دفعة راتب." },
        ])
      }

      if (!Number.isFinite(input.actualAmountDzd) || input.actualAmountDzd <= 0) {
        throw new CompanyError("VALIDATION", "يجب إدخال مبلغ راتب أكبر من صفر.", [
          { field: "actualAmountDzd", message: "يجب إدخال مبلغ راتب أكبر من صفر." },
        ])
      }

      const payment = this.repository.createSalaryPayment({
        employeeId: input.employeeId,
        periodType,
        expectedAmountDzd: expectedAmount,
        actualAmountDzd: input.actualAmountDzd,
        paymentDate: normalizeAlgeriaTimestamp(input.paymentDate),
        note: normalizeText(input.note),
      }, audit)

      return successResult("تم تسجيل دفعة الراتب بنجاح.", payment)
    });
  }

  getWarehouseAssignment(id: string) {
    const assignment = this.repository.getWarehouseAssignmentById(id);
    if (!assignment) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المستودع.");
    }

    return successResult("تم تحميل ربط المستودع بنجاح.", assignment);
  }

  createWarehouseAssignment(input: WarehouseAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

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
        startDate: normalizeAlgeriaTimestamp(input.startDate),
        endDate: input.status === "ACTIVE" ? null : input.endDate ?? null,
        notes: normalizeText(input.notes),
      }, audit);

      return successResult("تم إنشاء ربط المستودع بنجاح.", assignment);
    });
  }

  endWarehouseAssignment(input: WarehouseAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.withTransaction(() => {
      const audit = this.createMutationAuditContext(auditContext)

      const current = this.repository.getWarehouseAssignmentById(input.id);
      if (!current) {
        throw new CompanyError("NOT_FOUND", "تعذر العثور على ربط المستودع.");
      }

      if (current.status !== "ACTIVE") {
        throw new CompanyError("BUSINESS_RULE", "يمكن إنهاء روابط المستودعات النشطة فقط.");
      }

      const assignment = this.repository.endWarehouseAssignment({
        id: input.id,
        endDate: normalizeAlgeriaTimestamp(input.endDate),
        notes: input.notes !== undefined ? normalizeText(input.notes) : undefined,
      }, audit);

      return successResult("تم إنهاء ربط المستودع بنجاح.", assignment!);
    });
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

  private requireExternalCounterparty(id: string, field = "id") {
    const counterparty = this.repository.getExternalCounterpartyById(id)
    if (!counterparty) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الطرف الخارجي المطلوب.", [
        { field, message: "تعذر العثور على الطرف الخارجي المطلوب." },
      ])
    }

    return counterparty
  }

  private requireDebtAccount(id: string) {
    const account = this.repository.getDebtAccountById(id)
    if (!account) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على حساب الدين المطلوب.")
    }

    return account
  }

  private requireEmployeeWorker(id: string, field: string) {
    return this.requireEmployeeWithRoleKey(id, SYSTEM_ROLE_KEYS.worker, field)
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

  getEmployeeDebtAccount(employeeId: string) {
    this.requireEmployee(employeeId);
    const { items: accounts } = this.listDebtAccounts({ workerId: employeeId });
    return accounts[0] || null;
  }

  createEmployeeDebtEntry(input: { employeeId: string; entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE"; amountDzd: number; entryDate?: string; note?: string }, auditContext?: MutationAuditContext) {
    const employee = this.requireEmployee(input.employeeId);

    let account = this.getEmployeeDebtAccount(input.employeeId);

    if (!account) {
      const createResult = this.createDebtAccount(
        {
          partyType: "INTERNAL_WORKER",
          workerId: input.employeeId,
          note: `حساب الدين للعامل: ${employee.firstName} ${employee.lastName}`,
        },
        auditContext,
      );
      account = createResult.item;
    }

    const result = this.createDebtEntry(
      {
        debtAccountId: account.id,
        entryType: input.entryType,
        signedAmountDzd: input.amountDzd,
        entryDate: input.entryDate,
        note: input.note || `${input.entryType}: ${employee.firstName} ${employee.lastName}`,
      },
      auditContext,
    );

    return result.item;
  }
}
