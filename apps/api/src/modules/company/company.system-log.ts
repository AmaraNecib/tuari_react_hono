import type { CompanyRepository } from "./company.repository.contracts"
import { compareTimestampsDesc } from "./company-time"
import type { SystemLogEntryRecord, SystemLogListFilters } from "./company.types"

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

function getDebtEntryTypeLabel(entryType: string) {
  switch (entryType) {
    case "OPENING":
      return "رصيد افتتاحي"
    case "PAYMENT":
      return "دفعة"
    case "ADJUSTMENT":
      return "تعديل"
    case "SETTLEMENT":
      return "تسوية"
    default:
      return entryType
  }
}

function formatSignedDzd(amount: number) {
  const absoluteAmount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(Math.abs(amount))

  if (amount === 0) {
    return `0 دج`
  }

  return `${amount > 0 ? "+" : "-"}${absoluteAmount} دج`
}

function buildDebtEntrySummary(entryType: string, partyLabel: string) {
  switch (entryType) {
    case "OPENING":
      return `تم تسجيل رصيد افتتاحي للطرف ${partyLabel}`
    case "PAYMENT":
      return `تم تسجيل دفعة للطرف ${partyLabel}`
    case "ADJUSTMENT":
      return `تم تسجيل تعديل على دين الطرف ${partyLabel}`
    case "SETTLEMENT":
      return `تمت تسوية حساب الدين للطرف ${partyLabel}`
    default:
      return `تم تسجيل حركة دين للطرف ${partyLabel}`
  }
}

function buildDebtEntryDetail(entry: {
  entryType: string
  signedAmountDzd: number
  balanceAfterDzd: number
  note?: string | null
}) {
  return [
    `نوع الحركة ${getDebtEntryTypeLabel(entry.entryType)}`,
    `القيمة ${formatSignedDzd(entry.signedAmountDzd)}`,
    `الرصيد بعد العملية ${formatSignedDzd(entry.balanceAfterDzd)}`,
    entry.note?.trim() || null,
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" • ")
}

function buildGroupedDetailLine(primaryEvent: SystemLogEntryRecord, event: SystemLogEntryRecord) {
  const detail = event.detail?.trim() || null

  if (event.summary !== primaryEvent.summary && detail) {
    return `• ${event.summary} — ${detail}`
  }

  if (event.summary !== primaryEvent.summary) {
    return `• ${event.summary}`
  }

  if (detail) {
    return `• ${detail}`
  }

  return null
}

export function buildCompanySystemLog(repository: CompanyRepository, filters?: SystemLogListFilters) {
  const rolesById = new Map(repository.listRoles().map((role) => [role.id, role]))
  const employeesById = new Map(repository.listEmployees().map((employee) => [employee.id, employee]))
  const externalCounterpartiesById = new Map(
    repository.listExternalCounterparties().map((counterparty) => [counterparty.id, counterparty]),
  )
  const projectsById = new Map(repository.listProjects().map((project) => [project.id, project]))
  const warehousesById = new Map(repository.listWarehouses().map((warehouse) => [warehouse.id, warehouse]))
  const actorLabelCache = new Map<string, string | null>()

  // Single filter predicate shared by the group gate and the within-group
  // matching set. Dates are compared by actual timestamp value so that
  // non-ISO filter strings (e.g. date-only "2026-01-01") behave consistently.
  const matchesFilters = (event: SystemLogEntryRecord): boolean => {
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

    if (filters?.fromDate && compareTimestampsDesc(event.createdAt, filters.fromDate) > 0) {
      return false
    }

    if (filters?.toDate && compareTimestampsDesc(event.createdAt, filters.toDate) < 0) {
      return false
    }

    return true
  }

  const resolveActorLabel = (actorUserId: string | null) => {
    if (!actorUserId) {
      return null
    }

    if (actorLabelCache.has(actorUserId)) {
      return actorLabelCache.get(actorUserId)!
    }

    const authUser = repository.getAuthUserById(actorUserId)
    const actorLabel = authUser?.name ?? actorUserId

    actorLabelCache.set(actorUserId, actorLabel)
    return actorLabel
  }

  const logEvents: Array<SystemLogEntryRecord> = []

  for (const entry of repository.listEmployeeStateHistory()) {
    const employee = employeesById.get(entry.employeeId)
    const role = rolesById.get(entry.roleId)
    logEvents.push({
      id: `employee-state-${entry.id}`,
      transactionId: entry.transactionId,
      actorUserId: entry.actorUserId,
      actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
      actorCurrentLabel: resolveActorLabel(entry.actorUserId),
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

  for (const assignment of repository.listManagerAssignments()) {
    const worker = employeesById.get(assignment.workerId)
    const manager = employeesById.get(assignment.managerId)
    const verb = assignment.status === "ACTIVE" ? "تم ربط" : "تم إنهاء ربط"
    logEvents.push({
      id: `manager-assignment-${assignment.id}`,
      transactionId: assignment.transactionId,
      actorUserId: assignment.actorUserId,
      actorLabel: assignment.actorLabel ?? resolveActorLabel(assignment.actorUserId),
      actorCurrentLabel: resolveActorLabel(assignment.actorUserId),
      actionType: "WORKPLACE_ASSIGNED",
      entityType: "MANAGER_ASSIGNMENT",
      entityId: assignment.id,
      entityLabel: worker ? `${worker.firstName} ${worker.lastName}` : null,
      summary: `${verb} العامل ${worker ? `${worker.firstName} ${worker.lastName}` : assignment.workerId} بالمدير ${manager ? `${manager.firstName} ${manager.lastName}` : assignment.managerId}`,
      detail: assignment.notes,
      createdAt: assignment.updatedAt,
    })
  }

  for (const assignment of repository.listProjectAssignments()) {
    const employee = employeesById.get(assignment.employeeId)
    const project = projectsById.get(assignment.projectId)
    const verb = assignment.status === "ACTIVE" ? "تم إسناد" : "تم إنهاء إسناد"
    logEvents.push({
      id: `project-assignment-${assignment.id}`,
      transactionId: assignment.transactionId,
      actorUserId: assignment.actorUserId,
      actorLabel: assignment.actorLabel ?? resolveActorLabel(assignment.actorUserId),
      actorCurrentLabel: resolveActorLabel(assignment.actorUserId),
      actionType: "WORKPLACE_ASSIGNED",
      entityType: "PROJECT_ASSIGNMENT",
      entityId: assignment.id,
      entityLabel: project?.name ?? null,
      summary: `${verb} ${employee ? `${employee.firstName} ${employee.lastName}` : assignment.employeeId} إلى المشروع ${project?.name ?? assignment.projectId}`,
      detail: assignment.notes,
      createdAt: assignment.updatedAt,
    })
  }

  for (const assignment of repository.listWarehouseAssignments()) {
    const employee = employeesById.get(assignment.employeeId)
    const warehouse = warehousesById.get(assignment.warehouseId)
    const verb = assignment.status === "ACTIVE" ? "تم إسناد" : "تم إنهاء إسناد"
    logEvents.push({
      id: `warehouse-assignment-${assignment.id}`,
      transactionId: assignment.transactionId,
      actorUserId: assignment.actorUserId,
      actorLabel: assignment.actorLabel ?? resolveActorLabel(assignment.actorUserId),
      actorCurrentLabel: resolveActorLabel(assignment.actorUserId),
      actionType: "WORKPLACE_ASSIGNED",
      entityType: "WAREHOUSE_ASSIGNMENT",
      entityId: assignment.id,
      entityLabel: warehouse?.name ?? null,
      summary: `${verb} ${employee ? `${employee.firstName} ${employee.lastName}` : assignment.employeeId} إلى المستودع ${warehouse?.name ?? assignment.warehouseId}`,
      detail: assignment.notes,
      createdAt: assignment.updatedAt,
    })
  }

  for (const entry of repository.listProjectManagerOwnershipHistory()) {
    const project = projectsById.get(entry.projectId)
    const manager = employeesById.get(entry.managerId)
    const verb = entry.status === "ACTIVE" ? "تم تعيين" : "تم إنهاء تعيين"
    logEvents.push({
      id: `project-manager-history-${entry.id}`,
      transactionId: entry.transactionId,
      actorUserId: entry.actorUserId,
      actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
      actorCurrentLabel: resolveActorLabel(entry.actorUserId),
      actionType: "PROJECT_MANAGER_CHANGED",
      entityType: "PROJECT",
      entityId: entry.projectId,
      entityLabel: project?.name ?? null,
      summary: `${verb} ${manager ? `${manager.firstName} ${manager.lastName}` : entry.managerId} مديرًا للمشروع ${project?.name ?? entry.projectId}`,
      detail: entry.notes,
      createdAt: entry.updatedAt,
    })
  }

  for (const entry of repository.listWarehouseManagerOwnershipHistory()) {
    const warehouse = warehousesById.get(entry.warehouseId)
    const manager = employeesById.get(entry.managerId)
    const verb = entry.status === "ACTIVE" ? "تم تعيين" : "تم إنهاء تعيين"
    logEvents.push({
      id: `warehouse-manager-history-${entry.id}`,
      transactionId: entry.transactionId,
      actorUserId: entry.actorUserId,
      actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
      actorCurrentLabel: resolveActorLabel(entry.actorUserId),
      actionType: "WAREHOUSE_MANAGER_CHANGED",
      entityType: "WAREHOUSE",
      entityId: entry.warehouseId,
      entityLabel: warehouse?.name ?? null,
      summary: `${verb} ${manager ? `${manager.firstName} ${manager.lastName}` : entry.managerId} مديرًا للمستودع ${warehouse?.name ?? entry.warehouseId}`,
      detail: entry.notes,
      createdAt: entry.updatedAt,
    })
  }

  for (const payment of repository.listSalaryPayments()) {
    const employee = employeesById.get(payment.employeeId)
    logEvents.push({
      id: `salary-payment-${payment.id}`,
      transactionId: payment.transactionId,
      actorUserId: payment.actorUserId,
      actorLabel: payment.actorLabel ?? resolveActorLabel(payment.actorUserId),
      actorCurrentLabel: resolveActorLabel(payment.actorUserId),
      actionType: "SALARY_PAYMENT_RECORDED",
      entityType: "SALARY_PAYMENT",
      entityId: payment.id,
      entityLabel: employee ? `${employee.firstName} ${employee.lastName}` : null,
      summary: `تم تسجيل دفعة راتب للعامل ${employee ? `${employee.firstName} ${employee.lastName}` : payment.employeeId}`,
      detail: `المبلغ المدفوع ${payment.actualAmountDzd} دج`,
      createdAt: payment.updatedAt,
    })
  }

  for (const account of repository.listDebtAccounts()) {
    const employee = account.workerId ? employeesById.get(account.workerId) : null
    const counterparty = account.externalCounterpartyId
      ? externalCounterpartiesById.get(account.externalCounterpartyId)
      : null
    const partyLabel = employee
      ? `${employee.firstName} ${employee.lastName}`
      : counterparty?.fullName ?? account.id

    for (const entry of repository.listDebtEntries({ debtAccountId: account.id })) {
      const actionType = entry.entryType === "SETTLEMENT" ? "DEBT_SETTLED" : "DEBT_ENTRY_RECORDED"
      const summary = buildDebtEntrySummary(entry.entryType, partyLabel)

      logEvents.push({
        id: `debt-entry-${entry.id}`,
        transactionId: entry.transactionId,
        actorUserId: entry.actorUserId,
        actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
        actorCurrentLabel: resolveActorLabel(entry.actorUserId),
        actionType,
        entityType: "DEBT_ENTRY",
        entityId: entry.id,
        entityLabel: partyLabel,
        summary,
        detail: buildDebtEntryDetail(entry),
        createdAt: entry.updatedAt,
      })
    }
  }

  for (const entry of repository.listUserProfileHistory()) {
    const currentAccountLabel = resolveActorLabel(entry.userId)
    const accountDetailParts = [
      entry.previousName !== entry.name
        ? "تم تحديث الاسم"
        : null,
      entry.previousPhone !== entry.phone
        ? "تم تحديث رقم الهاتف"
        : null,
      entry.passwordChanged ? "تم تحديث كلمة المرور" : null,
    ].filter((value): value is string => Boolean(value))

    logEvents.push({
      id: `user-profile-${entry.id}`,
      transactionId: entry.transactionId,
      actorUserId: entry.actorUserId,
      actorLabel: entry.actorLabel ?? resolveActorLabel(entry.actorUserId),
      actorCurrentLabel: resolveActorLabel(entry.actorUserId),
      actionType: "ACCOUNT_UPDATED",
      entityType: "ACCOUNT",
      entityId: entry.userId,
      entityLabel: entry.name ?? currentAccountLabel,
      summary: `تم تحديث بيانات حساب ${entry.name ?? currentAccountLabel}`,
      detail: accountDetailParts.join(" • ") || null,
      createdAt: entry.updatedAt,
    })
  }

  for (const item of repository.listInventoryItemDefinitionsForLog()) {
    logEvents.push({
      id: `inventory-item-${item.id}`,
      transactionId: item.transactionId,
      actorUserId: item.actorUserId,
      actorLabel: item.actorLabel ?? resolveActorLabel(item.actorUserId),
      actorCurrentLabel: resolveActorLabel(item.actorUserId),
      actionType: "INVENTORY_ITEM_CREATED",
      entityType: "INVENTORY_ITEM",
      entityId: item.id,
      entityLabel: item.name,
      summary: `تم إنشاء تعريف عنصر ${item.name}`,
      detail: [
        item.itemType === "CONSUMABLE" ? "نوع العنصر مادة استهلاكية" : "نوع العنصر أصل",
        item.unit ? `الوحدة ${item.unit}` : null,
        item.description,
      ]
        .filter((value): value is string => Boolean(value && value.trim().length > 0))
        .join(" • "),
      createdAt: item.createdAt,
    })
  }

  const groupedEntries = Array.from(
    logEvents.reduce<Map<string, { events: SystemLogEntryRecord[]; key: string }>>((groups, event) => {
      const key = event.actionType === "DEBT_ENTRY_RECORDED" || event.actionType === "DEBT_SETTLED"
        ? event.id
        : event.transactionId ?? event.id
      const existing = groups.get(key)

      if (existing) {
        existing.events.push(event)
        return groups
      }

      groups.set(key, { events: [event], key })
      return groups
    }, new Map<string, { events: SystemLogEntryRecord[]; key: string }>()).values(),
  )
    // One shared predicate drives both the group-level gate and the within-group
    // matching set, so a group that survives the gate always has a non-empty
    // matching set below. (Historically the two blocks compared dates with
    // different operators, which could diverge for non-ISO date filters.)
    .filter(({ events }) => events.some(matchesFilters))
    .map(({ events, key }) => {
      const sortedEvents = [...events].sort((left, right) => compareTimestampsDesc(left.createdAt, right.createdAt))
      const matchingEvents = sortedEvents.filter(matchesFilters)
      const primaryEvent = (
        matchingEvents.find((event) => event.actionType === "SALARY_PAYMENT_RECORDED") ??
        matchingEvents.find((event) => event.actionType === "DEBT_SETTLED") ??
        matchingEvents.find((event) => event.actionType === "DEBT_ENTRY_RECORDED") ??
        matchingEvents.find((event) => event.actionType === "PROJECT_MANAGER_CHANGED") ??
        matchingEvents.find((event) => event.actionType === "WAREHOUSE_MANAGER_CHANGED") ??
        matchingEvents[0]
      )!

      const detailLines = sortedEvents
        .map((event) => buildGroupedDetailLine(primaryEvent, event))
        .filter((value): value is string => Boolean(value && value.trim().length > 0))
        .filter((value, index, values) => values.indexOf(value) === index)

      return {
        id: key,
        transactionId: primaryEvent.transactionId,
        actorUserId: primaryEvent.actorUserId,
        actorLabel: primaryEvent.actorLabel,
        actorCurrentLabel: primaryEvent.actorCurrentLabel,
        actionType: primaryEvent.actionType,
        entityType: primaryEvent.entityType,
        entityId: primaryEvent.entityId,
        entityLabel: primaryEvent.entityLabel,
        summary: primaryEvent.summary,
        detail: detailLines.length > 0 ? detailLines.join("\n") : primaryEvent.detail,
        createdAt: sortedEvents[0]!.createdAt,
      } satisfies SystemLogEntryRecord
    })
    .sort((left, right) => compareTimestampsDesc(left.createdAt, right.createdAt))

  return { items: groupedEntries }
}
