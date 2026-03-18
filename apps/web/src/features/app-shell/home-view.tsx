import "@/i18n"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { authBootstrapInputSchema, phonePasswordSignInSchema, type SystemLogEntry } from "@tuari/contracts"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmployeeDetailsPage } from "@/features/employees/employee-details-page"
import { EmployeeEditPage } from "@/features/employees/employee-edit-page"
import { useAppPreferences } from "@/features/preferences/preferences"
import { ProjectDetailsPage } from "@/features/projects/project-details-page"
import { ProjectEditPage } from "@/features/projects/project-edit-page"
import { getArabicHistoryEventLabel, getArabicRoleLabel, getArabicStatusLabel } from "@/features/shared/status-meta"
import { WarehouseDetailsPage } from "@/features/warehouses/warehouse-details-page"
import { WarehouseEditPage } from "@/features/warehouses/warehouse-edit-page"
import { extractAuthErrorMessage } from "@/lib/auth-api"
import { showSuccessToast } from "@/lib/toast"

import { DashboardSection } from "./dashboard-section"
import { EmployeesSection } from "./employees-section"
import {
  useAddWorkspaceRecordMutation,
  useAuthSetupStatusQuery,
  useBootstrapFirstUserMutation,
  useDemoSessionQuery,
  useDemoSignInMutation,
  useDemoSignOutMutation,
  useDemoWorkspaceQuery,
  useRemoveWorkspaceRecordMutation,
  useResetWorkspaceMutation,
  useSystemLogQuery,
  useUpdateAccountSettingsMutation,
  type DemoEmployee,
} from "./mock-dashboard"
import { ProjectsSection } from "./projects-section"
import { RolesSection } from "./roles-section"
import { SettingsSection } from "./settings-section"
import { SystemLogSection } from "./system-log-section"
import { WarehousesSection } from "./warehouses-section"
import { WorkspaceBreadcrumbs } from "./workspace-breadcrumbs"
import { WorkspaceSidebar, type WorkspaceSidebarPage } from "./workspace-sidebar"

export type HomeViewPage = WorkspaceSidebarPage

type PendingDelete = {
  section: "projects" | "roles" | "warehouses"
  id: string
  label: string
}

type FormErrors = {
  name?: string
  phone?: string
  password?: string
  setupSecret?: string
}

function formatName(employee: DemoEmployee) {
  return `${employee.firstName} ${employee.lastName}`
}

function toSafeRouteSegment(value: string) {
  return encodeURIComponent(value)
}

function includeCurrentManagerOption(
  options: Array<{ id: string; label: string }>,
  currentManager: { id: string | null; label: string },
) {
  if (!currentManager.id || options.some((option) => option.id === currentManager.id)) {
    return options
  }

  return [{ id: currentManager.id, label: currentManager.label }, ...options]
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function formatDateRange(startDate: string | null, endDate: string | null, ongoingLabel: string) {
  return `${formatDateLabel(startDate)} - ${endDate ? formatDateLabel(endDate) : ongoingLabel}`
}

function formatSalaryPeriodLabel(
  value: "DAILY" | "WEEKLY" | "MONTHLY" | null,
  labels: { daily: string; monthly: string; weekly: string },
) {
  if (value === "DAILY") {
    return labels.daily
  }

  if (value === "WEEKLY") {
    return labels.weekly
  }

  if (value === "MONTHLY") {
    return labels.monthly
  }

  return null
}

function mapCredentialErrors(
  copy: { validation: { phone: string; phoneFormat: string; password: string; passwordShort: string } },
  phone: string,
  password: string,
) {
  const errors: FormErrors = {}
  const result = phonePasswordSignInSchema.safeParse({
    phone: phone.trim(),
    password,
  })

  if (phone.trim().length === 0) {
    errors.phone = copy.validation.phone
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "phone")) {
    errors.phone = copy.validation.phoneFormat
  }

  if (password.length === 0) {
    errors.password = copy.validation.password
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "password")) {
    errors.password = copy.validation.passwordShort
  }

  return errors
}

function mapBootstrapErrors(
  copy: {
    validation: {
      name: string
      phone: string
      phoneFormat: string
      password: string
      passwordShort: string
      setupSecret: string
    }
  },
  name: string,
  phone: string,
  password: string,
  setupSecret: string,
  requiresSetupKey: boolean,
) {
  const errors = mapCredentialErrors(copy, phone, password)
  const result = authBootstrapInputSchema.safeParse({
    name: name.trim(),
    phone: phone.trim(),
    password,
  })

  if (name.trim().length === 0) {
    errors.name = copy.validation.name
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "name")) {
    errors.name = copy.validation.name
  }

  if (requiresSetupKey && setupSecret.trim().length === 0) {
    errors.setupSecret = copy.validation.setupSecret
  }

  return errors
}

export function HomeView({
  detailTab,
  page = "dashboard",
  employeeId,
  projectId,
  warehouseId,
}: {
  detailTab?: string
  page?: HomeViewPage
  employeeId?: string
  projectId?: string
  warehouseId?: string
}) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useAppPreferences()
  const [systemLogFilters, setSystemLogFilters] = useState<{
    actionType?: SystemLogEntry["actionType"]
    actorUserId?: string
    entityType?: SystemLogEntry["entityType"]
    fromDate?: string
    toDate?: string
  }>({})
  const setupStatusQuery = useAuthSetupStatusQuery()
  const sessionQuery = useDemoSessionQuery()
  const workspaceQuery = useDemoWorkspaceQuery()
  const systemLogQuery = useSystemLogQuery({ enabled: page === "transactions", filters: systemLogFilters })
  const bootstrapMutation = useBootstrapFirstUserMutation()
  const signInMutation = useDemoSignInMutation()
  const signOutMutation = useDemoSignOutMutation()
  const addRecordMutation = useAddWorkspaceRecordMutation()
  const removeRecordMutation = useRemoveWorkspaceRecordMutation()
  const resetWorkspaceMutation = useResetWorkspaceMutation()
  const updateAccountSettingsMutation = useUpdateAccountSettingsMutation()

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [setupSecret, setSetupSecret] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})
  const [authError, setAuthError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    return window.innerWidth < 1200
  })
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const workspace = workspaceQuery.data
  const session = sessionQuery.data

  const copy = {
    auth: {
      loginTitle: t("auth.loginTitle"),
      setupTitle: t("auth.setupTitle"),
      nameLabel: t("auth.nameLabel"),
      phoneLabel: t("auth.phoneLabel"),
      passwordLabel: t("auth.passwordLabel"),
      setupSecretLabel: t("auth.setupSecretLabel"),
      namePlaceholder: t("auth.namePlaceholder"),
      phonePlaceholder: t("auth.phonePlaceholder"),
      passwordPlaceholder: t("auth.passwordPlaceholder"),
      setupSecretPlaceholder: t("auth.setupSecretPlaceholder"),
      signIn: t("auth.signIn"),
      createFirstUser: t("auth.createFirstUser"),
      startupErrorTitle: t("auth.startupErrorTitle"),
      startupErrorDescription: t("auth.startupErrorDescription"),
      signInError: t("auth.signInError"),
    },
    common: {
      cancel: t("common.cancel"),
      confirm: t("common.confirm"),
      archive: t("common.archive"),
      delete: t("common.delete"),
      yes: t("common.yes"),
      no: t("common.no"),
      retry: t("common.retry"),
      loadingAuth: t("common.loadingAuth"),
      view: t("common.view"),
      edit: t("common.edit"),
      leave: t("common.leave"),
      actions: t("common.actions"),
    },
    shell: {
      description: t("shell.description"),
      addWorker: t("shell.addWorker"),
      addProject: t("shell.addProject"),
      addWarehouse: t("shell.addWarehouse"),
      addRole: t("shell.addRole"),
      collapse: t("shell.collapse"),
      expand: t("shell.expand"),
      themeToggle: t("shell.themeToggle"),
      signOut: t("shell.signOut"),
      resetWorkspace: t("shell.resetWorkspace"),
      signOutTitle: t("shell.signOutTitle"),
      signOutDescription: t("shell.signOutDescription"),
      destructiveTitle: t("shell.destructiveTitle"),
      destructiveDescription: t("shell.destructiveDescription"),
      empty: t("shell.empty"),
      noManager: t("shell.noManager"),
      noProject: t("shell.noProject"),
      noLocation: t("shell.noLocation"),
      noAddress: t("shell.noAddress"),
      themeLight: t("shell.themeLight"),
      themeDark: t("shell.themeDark"),
      settingsThemeDescription: t("shell.settingsThemeDescription"),
      settingsResetDescription: t("shell.settingsResetDescription"),
      settingsAccountTitle: t("shell.settingsAccountTitle"),
      settingsAccountDescription: t("shell.settingsAccountDescription"),
      settingsAccountName: t("shell.settingsAccountName"),
      settingsAccountPhone: t("shell.settingsAccountPhone"),
      settingsAccountPhoneHint: t("shell.settingsAccountPhoneHint"),
      settingsAccountCurrentPassword: t("shell.settingsAccountCurrentPassword"),
      settingsAccountNewPassword: t("shell.settingsAccountNewPassword"),
      settingsAccountSave: t("shell.settingsAccountSave"),
      settingsAccountNamePlaceholder: t("shell.settingsAccountNamePlaceholder"),
      settingsAccountPhonePlaceholder: t("shell.settingsAccountPhonePlaceholder"),
      settingsAccountCurrentPasswordPlaceholder: t("shell.settingsAccountCurrentPasswordPlaceholder"),
      settingsAccountNewPasswordPlaceholder: t("shell.settingsAccountNewPasswordPlaceholder"),
      leaveTitle: t("shell.leaveTitle"),
      leaveDescription: t("shell.leaveDescription"),
      deleteEmployeeTitle: t("shell.deleteEmployeeTitle"),
      deleteEmployeeDescription: t("shell.deleteEmployeeDescription"),
    },
    validation: {
      name: t("auth.validation.name"),
      phone: t("auth.validation.phone"),
      phoneFormat: t("auth.validation.phoneFormat"),
      password: t("auth.validation.password"),
      passwordShort: t("auth.validation.passwordShort"),
      setupSecret: t("auth.validation.setupSecret"),
    },
    dashboard: {
      title: t("sections.dashboard.label"),
      description: t("sections.dashboard.description"),
    },
    metrics: {
      workers: t("metrics.workers"),
      projects: t("metrics.projects"),
      warehouses: t("metrics.warehouses"),
      roles: t("metrics.roles"),
    },
    columns: {
      name: t("columns.name"),
      role: t("columns.role"),
      manager: t("columns.manager"),
      project: t("columns.project"),
      phone: t("columns.phone"),
      status: t("columns.status"),
      location: t("columns.location"),
      workers: t("columns.workers"),
      address: t("columns.address"),
      system: t("columns.system"),
      description: t("columns.description"),
      key: t("columns.key"),
    },
    sections: {
      dashboard: {
        label: t("sections.dashboard.label"),
        description: t("sections.dashboard.description"),
      },
      employees: {
        label: t("sections.employees.label"),
        description: t("sections.employees.description"),
      },
      projects: {
        label: t("sections.projects.label"),
        description: t("sections.projects.description"),
      },
      warehouses: {
        label: t("sections.warehouses.label"),
        description: t("sections.warehouses.description"),
      },
      transactions: {
        label: t("sections.transactions.label"),
        description: t("sections.transactions.description"),
      },
      roles: {
        label: t("sections.roles.label"),
        description: t("sections.roles.description"),
      },
      settings: {
        label: t("sections.settings.label"),
        description: t("sections.settings.description"),
      },
    },
    toasts: {
      themeDark: t("toasts.themeDark"),
      themeLight: t("toasts.themeLight"),
    },
    detailPages: {
      shared: {
        back: t("detailPages.shared.back"),
        currentAssignment: t("detailPages.shared.currentAssignment"),
        currentlySelected: t("detailPages.shared.currentlySelected"),
        activeRoleMissing: t("detailPages.shared.activeRoleMissing"),
        activeWarehouseMissing: t("detailPages.shared.activeWarehouseMissing"),
        activeWorkerMissing: t("detailPages.shared.activeWorkerMissing"),
        missingRecordDescription: t("detailPages.shared.missingRecordDescription"),
        ongoing: t("detailPages.shared.ongoing"),
      },
      salary: {
        activeSalaryPrefix: t("detailPages.salary.activeSalaryPrefix"),
        currency: t("detailPages.salary.currency"),
        daily: t("detailPages.salary.daily"),
        weekly: t("detailPages.salary.weekly"),
        monthly: t("detailPages.salary.monthly"),
      },
      employee: {
        employmentState: t("detailPages.employee.employmentState"),
        directManager: t("detailPages.employee.directManager"),
        projectAssignment: t("detailPages.employee.projectAssignment"),
        warehouseAssignment: t("detailPages.employee.warehouseAssignment"),
        projectOwnership: t("detailPages.employee.projectOwnership"),
        warehouseOwnership: t("detailPages.employee.warehouseOwnership"),
      },
      project: {
        managerLabel: t("detailPages.project.manager"),
      },
      warehouse: {
        managerLabel: t("detailPages.warehouse.manager"),
      },
    },
  }

  const detailCopy = useMemo(() => copy.detailPages, [i18n.language])

  const derived = useMemo(() => {
    if (!workspace) {
      return null
    }

    const roleById = new Map(workspace.roles.map((role) => [role.id, role]))
    const employeeById = new Map(workspace.employees.map((employee) => [employee.id, employee]))
    const projectById = new Map(workspace.projects.map((project) => [project.id, project]))
    const activeManagerByWorker = new Map(
      workspace.managerAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.workerId, assignment]),
    )
    const activeProjectByEmployee = new Map(
      workspace.projectAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.employeeId, assignment]),
    )
    const activeWarehouseByEmployee = new Map(
      workspace.warehouseAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.employeeId, assignment]),
    )

    const employeeRows = workspace.employees
      .map((employee) => {
        const role = roleById.get(employee.roleId)
        const managerAssignment = activeManagerByWorker.get(employee.id) ?? null
        const manager = managerAssignment ? employeeById.get(managerAssignment.managerId) : null
        const projectAssignment = activeProjectByEmployee.get(employee.id) ?? null
        const project = projectAssignment ? projectById.get(projectAssignment.projectId) : null
        const warehouseAssignment = activeWarehouseByEmployee.get(employee.id) ?? null
        const warehouse = warehouseAssignment
          ? workspace.warehouses.find((warehouseItem) => warehouseItem.id === warehouseAssignment.warehouseId) ?? null
          : null
        const hasManagerHistory = workspace.managerAssignments.some(
          (assignment) => assignment.workerId === employee.id || assignment.managerId === employee.id,
        )
        const hasProjectHistory = workspace.projectAssignments.some(
          (assignment) => assignment.employeeId === employee.id,
        )
        const hasWarehouseHistory = workspace.warehouseAssignments.some(
          (assignment) => assignment.employeeId === employee.id,
        )
      const managesAnyProject = workspace.projects.some((projectItem) => projectItem.managerId === employee.id)
      const managesAnyWarehouse = workspace.warehouses.some(
        (warehouseItem) => warehouseItem.managerId === employee.id,
      )
      const hasManagedProjectHistory = workspace.projectManagerOwnershipHistory.some((entry) => entry.managerId === employee.id)
      const hasManagedWarehouseHistory = workspace.warehouseManagerOwnershipHistory.some((entry) => entry.managerId === employee.id)
      const hasSalaryPayments = workspace.salaryPayments.some((payment) => payment.employeeId === employee.id)
      const canDelete =
        !hasManagerHistory &&
        !hasProjectHistory &&
        !hasWarehouseHistory &&
        !hasManagedProjectHistory &&
        !hasManagedWarehouseHistory &&
        !hasSalaryPayments &&
        !managesAnyProject &&
        !managesAnyWarehouse
      const deleteDisabledReason = canDelete
        ? null
          : hasManagerHistory
            ? t("detailPages.employee.deleteReasonManagementHistory")
            : hasProjectHistory || hasWarehouseHistory
            ? t("detailPages.employee.deleteReasonWorkHistory")
            : hasManagedProjectHistory || hasManagedWarehouseHistory || hasSalaryPayments
              ? t("detailPages.employee.deleteReasonHistoryOrPayments")
              : managesAnyProject || managesAnyWarehouse
                ? t("detailPages.employee.deleteReasonManagedScope")
                : t("detailPages.employee.deleteReasonFallback")
        const canLeave =
          employee.status === "ACTIVE" &&
          !(
            (role?.key === "worker" && (managerAssignment || projectAssignment || warehouseAssignment)) ||
            (role?.key === "project_manager" &&
              (workspace.projects.some(
                (projectItem) => projectItem.managerId === employee.id && projectItem.status === "ACTIVE",
              ) ||
                projectAssignment ||
                warehouseAssignment ||
                workspace.managerAssignments.some(
                  (assignment) => assignment.managerId === employee.id && assignment.status === "ACTIVE",
                ))) ||
            (role?.key === "warehouse_manager" &&
              (workspace.warehouses.some(
                (warehouseItem) => warehouseItem.managerId === employee.id && warehouseItem.status === "ACTIVE",
              ) ||
                projectAssignment ||
                warehouseAssignment))
          )
        const leaveDisabledReason = canLeave
          ? null
          : employee.status !== "ACTIVE"
            ? t("detailPages.employee.leaveReasonInactive")
            : role?.key === "worker" && (managerAssignment || projectAssignment || warehouseAssignment)
              ? t("detailPages.employee.leaveReasonWorkerLinked")
              : role?.key === "project_manager"
                ? t("detailPages.employee.leaveReasonProjectManagerLinked")
                : role?.key === "warehouse_manager"
                  ? t("detailPages.employee.leaveReasonWarehouseManagerLinked")
                  : t("detailPages.employee.leaveReasonFallback")

        return {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          name: formatName(employee),
          roleId: employee.roleId,
          roleKey: role?.key ?? "",
          role: role ? getArabicRoleLabel(role) : copy.shell.noManager,
          phone: employee.phone,
          status: employee.status,
          salaryAmountDzd: employee.salaryAmountDzd,
          salaryPeriod: employee.salaryPeriod,
          managerName: manager ? formatName(manager) : copy.shell.noManager,
          managerAssignmentId: managerAssignment?.id ?? null,
          currentManagerId: manager?.id ?? null,
          currentProjectId: project?.id ?? null,
          currentProjectAssignmentId: projectAssignment?.id ?? null,
          currentWarehouseId: warehouse?.id ?? null,
          currentWarehouseAssignmentId: warehouseAssignment?.id ?? null,
          projectName: project?.name ?? warehouse?.name ?? copy.shell.noProject,
          notes: employee.notes,
          isWorker: role?.key === "worker",
          canDelete,
          canLeave,
          deleteDisabledReason,
          leaveDisabledReason,
          createdAt: employee.createdAt,
          updatedAt: employee.updatedAt,
        }
      })
      .sort((left, right) => {
        const rolePriority: Record<string, number> = {
          project_manager: 0,
          warehouse_manager: 1,
          worker: 2,
        }

        const priorityDifference = (rolePriority[left.roleKey] ?? 99) - (rolePriority[right.roleKey] ?? 99)

        return priorityDifference !== 0 ? priorityDifference : left.name.localeCompare(right.name, "ar")
      })

    const projects = workspace.projects.map((project) => {
      const manager = project.managerId ? employeeById.get(project.managerId) : null
      const activeWorkers = workspace.projectAssignments.filter(
        (assignment) => assignment.projectId === project.id && assignment.status === "ACTIVE",
      ).length

      return {
        ...project,
        managerName: manager ? formatName(manager) : copy.shell.noManager,
        activeWorkers,
      }
    })

    const warehouses = workspace.warehouses.map((warehouse) => {
      const manager = warehouse.managerId ? employeeById.get(warehouse.managerId) : null
      const hasActiveWarehouseWorkers =
        workspace.warehouseAssignments.some(
          (assignment) => assignment.warehouseId === warehouse.id && assignment.status === "ACTIVE",
        )
      const hasActiveManagerRelation = warehouse.managerId !== null
      const canArchive = !hasActiveWarehouseWorkers && !hasActiveManagerRelation
      const archiveDisabledReason = canArchive
        ? null
        : hasActiveWarehouseWorkers && hasActiveManagerRelation
          ? t("detailPages.warehouse.archiveReasonManagerAndWorkers")
          : hasActiveWarehouseWorkers
            ? t("detailPages.warehouse.archiveReasonWorkers")
            : t("detailPages.warehouse.archiveReasonManager")

      return {
        ...warehouse,
        managerName: manager ? formatName(manager) : copy.shell.noManager,
        canArchive,
        archiveDisabledReason,
      }
    })

    const managerOptions = workspace.employees
      .filter((employee) => {
        const role = roleById.get(employee.roleId)
        return employee.status === "ACTIVE" && role?.key === "project_manager"
      })
      .map((employee) => ({
        id: employee.id,
        label: `${formatName(employee)} - ${employee.phone}`,
        projectOptions: workspace.projects
          .filter((project) => project.managerId === employee.id && project.status === "ACTIVE")
          .map((project) => ({ id: project.id, label: project.name }))
          .sort((left, right) => left.label.localeCompare(right.label, "ar")),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "ar"))

    const warehouseManagerOptions = workspace.employees
      .filter((employee) => {
        const role = roleById.get(employee.roleId)
        return employee.status === "ACTIVE" && role?.key === "warehouse_manager"
      })
      .map((employee) => ({
        id: employee.id,
        label: `${formatName(employee)} - ${employee.phone}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "ar"))

    const managerHistoryByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => [
        employee.id,
        workspace.managerAssignments
          .filter((assignment) => assignment.workerId === employee.id)
          .sort((left, right) => right.startDate.localeCompare(left.startDate))
          .map((assignment) => ({
            id: assignment.id,
            label: employeeById.get(assignment.managerId)
              ? formatName(employeeById.get(assignment.managerId)!)
              : copy.shell.noManager,
            secondary: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
            status: assignment.status,
          })),
      ]),
    )

    const projectHistoryByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => [
        employee.id,
        workspace.projectAssignments
          .filter((assignment) => assignment.employeeId === employee.id)
          .sort((left, right) => right.startDate.localeCompare(left.startDate))
          .map((assignment) => ({
            id: assignment.id,
            label: projectById.get(assignment.projectId)?.name ?? copy.shell.noProject,
            secondary: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
            status: assignment.status,
          })),
      ]),
    )

    const warehouseHistoryByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => [
        employee.id,
        workspace.warehouseAssignments
          .filter((assignment) => assignment.employeeId === employee.id)
          .sort((left, right) => right.startDate.localeCompare(left.startDate))
          .map((assignment) => ({
            id: assignment.id,
            label:
              workspace.warehouses.find((warehouse) => warehouse.id === assignment.warehouseId)?.name ??
              detailCopy.shared.activeWarehouseMissing,
            secondary: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
            status: assignment.status,
          })),
      ]),
    )

    const managedProjectsByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => [
        employee.id,
        workspace.projects
          .filter((project) => project.managerId === employee.id && project.status === "ACTIVE")
          .map((project) => project.name),
      ]),
    )

    const managedWarehousesByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => [
        employee.id,
        workspace.warehouses
          .filter((warehouse) => warehouse.managerId === employee.id && warehouse.status === "ACTIVE")
          .map((warehouse) => warehouse.name),
      ]),
    )

    const salaryPaymentsByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => [
        employee.id,
        workspace.salaryPayments
          .filter((payment) => payment.employeeId === employee.id)
          .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate)),
      ]),
    )

    const workHistoryByEmployeeId = Object.fromEntries(
      workspace.employees.map((employee) => {
        const items = [
          ...workspace.employeeStateHistory
            .filter((entry) => entry.employeeId === employee.id)
            .map((entry) => ({
              id: `state-${entry.id}`,
              typeLabel: detailCopy.employee.employmentState,
               title: `${getArabicRoleLabel(roleById.get(entry.roleId) ?? null)} - ${getArabicStatusLabel(entry.status)}`,
              detail:
                entry.salaryAmountDzd !== null
                  ? `${detailCopy.salary.activeSalaryPrefix} ${entry.salaryAmountDzd} ${detailCopy.salary.currency}${formatSalaryPeriodLabel(entry.salaryPeriod, detailCopy.salary) ? ` / ${formatSalaryPeriodLabel(entry.salaryPeriod, detailCopy.salary)}` : ""}`
                  : null,
              periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
              statusLabel: getArabicHistoryEventLabel(entry.eventType),
              sortValue: entry.startDate,
            })),
          ...workspace.managerAssignments
            .filter((assignment) => assignment.workerId === employee.id)
            .map((assignment) => ({
              id: `manager-${assignment.id}`,
              typeLabel: detailCopy.employee.directManager,
              title: employeeById.get(assignment.managerId) ? formatName(employeeById.get(assignment.managerId)!) : copy.shell.noManager,
              detail: assignment.notes,
              periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
              statusLabel: getArabicStatusLabel(assignment.status),
              sortValue: assignment.startDate,
            })),
          ...workspace.projectAssignments
            .filter((assignment) => assignment.employeeId === employee.id)
            .map((assignment) => ({
              id: `project-${assignment.id}`,
              typeLabel: detailCopy.employee.projectAssignment,
              title: projectById.get(assignment.projectId)?.name ?? copy.shell.noProject,
              detail: assignment.notes,
              periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
              statusLabel: getArabicStatusLabel(assignment.status),
              sortValue: assignment.startDate,
            })),
          ...workspace.warehouseAssignments
            .filter((assignment) => assignment.employeeId === employee.id)
            .map((assignment) => ({
              id: `warehouse-${assignment.id}`,
              typeLabel: detailCopy.employee.warehouseAssignment,
              title:
                workspace.warehouses.find((warehouse) => warehouse.id === assignment.warehouseId)?.name ??
                detailCopy.shared.activeWarehouseMissing,
              detail: assignment.notes,
              periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
              statusLabel: getArabicStatusLabel(assignment.status),
              sortValue: assignment.startDate,
            })),
          ...workspace.projectManagerOwnershipHistory
            .filter((entry) => entry.managerId === employee.id)
            .map((entry) => ({
              id: `managed-project-${entry.id}`,
              typeLabel: detailCopy.employee.projectOwnership,
              title: projectById.get(entry.projectId)?.name ?? copy.shell.noProject,
              detail: entry.notes,
              periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
              statusLabel: getArabicStatusLabel(entry.status),
              sortValue: entry.startDate,
            })),
          ...workspace.warehouseManagerOwnershipHistory
            .filter((entry) => entry.managerId === employee.id)
            .map((entry) => ({
              id: `managed-warehouse-${entry.id}`,
              typeLabel: detailCopy.employee.warehouseOwnership,
              title:
                workspace.warehouses.find((warehouse) => warehouse.id === entry.warehouseId)?.name ??
                detailCopy.shared.activeWarehouseMissing,
              detail: entry.notes,
              periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
              statusLabel: getArabicStatusLabel(entry.status),
              sortValue: entry.startDate,
            })),
        ]

        return [
          employee.id,
          items
            .sort((left, right) => right.sortValue.localeCompare(left.sortValue))
            .map(({ sortValue, ...item }) => item),
        ]
      }),
    )

    const projectWorkersByProjectId = Object.fromEntries(
      workspace.projects.map((project) => [
        project.id,
        workspace.projectAssignments
          .filter((assignment) => assignment.projectId === project.id && assignment.status === "ACTIVE")
          .map((assignment) => {
            const worker = employeeById.get(assignment.employeeId)
            const workerRole = worker ? roleById.get(worker.roleId) : null

            return {
              id: assignment.id,
               typeLabel: getArabicRoleLabel(workerRole ?? null),
              title: worker ? formatName(worker) : detailCopy.shared.activeWorkerMissing,
              detail: assignment.notes,
              periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
              statusLabel: detailCopy.shared.currentAssignment,
            }
          }),
      ]),
    )

    const projectManagementHistoryByProjectId = Object.fromEntries(
      workspace.projects.map((project) => [
        project.id,
        workspace.projectManagerOwnershipHistory
          .filter((entry) => entry.projectId === project.id)
          .sort((left, right) => right.startDate.localeCompare(left.startDate))
          .map((entry) => ({
            id: entry.id,
            typeLabel: detailCopy.project.managerLabel,
            title: employeeById.get(entry.managerId) ? formatName(employeeById.get(entry.managerId)!) : copy.shell.noManager,
            detail: entry.notes,
            periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
            statusLabel: getArabicStatusLabel(entry.status),
          })),
      ]),
    )

    const warehouseManagementHistoryByWarehouseId = Object.fromEntries(
      workspace.warehouses.map((warehouse) => [
        warehouse.id,
        workspace.warehouseManagerOwnershipHistory
          .filter((entry) => entry.warehouseId === warehouse.id)
          .sort((left, right) => right.startDate.localeCompare(left.startDate))
          .map((entry) => ({
            id: entry.id,
            typeLabel: detailCopy.warehouse.managerLabel,
            title: employeeById.get(entry.managerId) ? formatName(employeeById.get(entry.managerId)!) : copy.shell.noManager,
            detail: entry.notes,
            periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
            statusLabel: getArabicStatusLabel(entry.status),
          })),
      ]),
    )

    const warehouseWorkersByWarehouseId = Object.fromEntries(
      workspace.warehouses.map((warehouse) => [
        warehouse.id,
        workspace.warehouseAssignments
          .filter((assignment) => assignment.warehouseId === warehouse.id && assignment.status === "ACTIVE")
          .map((assignment) => {
            const worker = employeeById.get(assignment.employeeId)
            const workerRole = worker ? roleById.get(worker.roleId) : null

            return {
              id: assignment.id,
               typeLabel: getArabicRoleLabel(workerRole ?? null),
              title: worker ? formatName(worker) : detailCopy.shared.activeWorkerMissing,
              detail: assignment.notes,
              periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
              statusLabel: detailCopy.shared.currentAssignment,
            }
          }),
      ]),
    )

    const projectOptions = workspace.projects
      .filter((project) => project.status === "ACTIVE")
      .map((project) => ({ id: project.id, label: project.name }))
      .sort((left, right) => left.label.localeCompare(right.label, "ar"))

    const warehouseOptions = workspace.warehouses
      .filter((warehouse) => warehouse.status === "ACTIVE")
      .map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))
      .sort((left, right) => left.label.localeCompare(right.label, "ar"))

    return {
      employeeRows,
      projects,
      warehouses,
      roles: workspace.roles,
      managerOptions,
      projectManagerOptions: managerOptions,
      warehouseManagerOptions,
      managerHistoryByEmployeeId,
      projectHistoryByEmployeeId,
      warehouseHistoryByEmployeeId,
      managedProjectsByEmployeeId,
      managedWarehousesByEmployeeId,
      salaryPaymentsByEmployeeId,
      workHistoryByEmployeeId,
      projectManagementHistoryByProjectId,
      projectWorkersByProjectId,
      projectOptions,
      metrics: {
        workers: employeeRows.filter((employee) => employee.status === "ACTIVE" && employee.isWorker).length,
        projects: projects.filter((project) => project.status === "ACTIVE").length,
        warehouses: warehouses.filter((warehouse) => warehouse.status !== "ARCHIVED").length,
        roles: workspace.roles.length,
      },
      warehouseManagementHistoryByWarehouseId,
      warehouseOptions,
      warehouseWorkersByWarehouseId,
    }
  }, [detailCopy, copy.shell.noManager, copy.shell.noProject, i18n.language, workspace])

  const setupStatus = setupStatusQuery.data
  const hasUsers = setupStatus?.hasUsers ?? false
  const requiresSetupKey = setupStatus?.requiresSetupKey ?? false
  const authStartupError = setupStatusQuery.error ?? sessionQuery.error ?? null
  const isAuthStateLoading = (!setupStatus && !authStartupError) || sessionQuery.isPending
  const isFirstRun = !session && !hasUsers

  useEffect(() => {
    function syncSidebarForViewport() {
      if (window.innerWidth < 1200) {
        setSidebarCollapsed(true)
      }
    }

    syncSidebarForViewport()
    window.addEventListener("resize", syncSidebarForViewport)
    return () => window.removeEventListener("resize", syncSidebarForViewport)
  }, [])

  function handleThemeToggle() {
    toggleTheme()
    showSuccessToast(theme === "light" ? copy.toasts.themeDark : copy.toasts.themeLight)
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = mapCredentialErrors(copy, phone, password)
    setErrors(nextErrors)
    setAuthError(null)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      await signInMutation.mutateAsync({
        phone: phone.trim(),
        password,
        rememberMe: true,
      })
    } catch (error) {
      setAuthError(extractAuthErrorMessage(error, copy.auth.signInError))
      return
    }

    setPassword("")
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = mapBootstrapErrors(copy, name, phone, password, setupSecret, requiresSetupKey)
    setErrors(nextErrors)
    setAuthError(null)

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }

    try {
      await bootstrapMutation.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        password,
        setupSecret: setupSecret.trim() || undefined,
      })

      await signInMutation.mutateAsync({
        phone: phone.trim(),
        password,
        rememberMe: true,
      })
    } catch (error) {
      setAuthError(extractAuthErrorMessage(error, copy.auth.signInError))
      return
    }

    setName("")
    setPassword("")
    setSetupSecret("")
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return
    }

    await removeRecordMutation.mutateAsync({
      section: pendingDelete.section,
      id: pendingDelete.id,
    })

    setPendingDelete(null)
  }

  async function confirmSignOut() {
    await signOutMutation.mutateAsync()
    setSignOutOpen(false)
  }

  async function retryAuthState() {
    await Promise.all([setupStatusQuery.refetch(), sessionQuery.refetch()])
  }

  if (!session) {
    if (isAuthStateLoading) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6 py-8">
          <section className="w-full max-w-lg rounded-[32px] border border-white/70 bg-card/94 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-card/94 lg:p-10">
            <p className="text-sm text-muted-foreground">{copy.common.loadingAuth}</p>
          </section>
        </main>
      )
    }

    if (authStartupError) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6 py-8">
          <section className="w-full max-w-lg rounded-[32px] border border-white/70 bg-card/94 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-card/94 lg:p-10">
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{copy.auth.startupErrorTitle}</h1>
              <p className="text-sm leading-6 text-muted-foreground">{copy.auth.startupErrorDescription}</p>
            </div>

            <Button className="mt-6 h-11 w-full rounded-2xl text-base" type="button" variant="outline" onClick={() => void retryAuthState()}>
              {copy.common.retry}
            </Button>
          </section>
        </main>
      )
    }

    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-8">
        <section className="w-full max-w-lg rounded-[32px] border border-white/70 bg-card/94 p-8 backdrop-blur-xl dark:border-white/10 dark:bg-card/94 lg:p-10">
          <form className="space-y-7" onSubmit={isFirstRun ? handleBootstrap : handleSignIn}>
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {isFirstRun ? copy.auth.setupTitle : copy.auth.loginTitle}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">{copy.shell.description}</p>
            </div>

            <div className="space-y-5">
              {isFirstRun ? (
                <label className="flex flex-col gap-2.5">
                  <span className="text-sm font-medium text-foreground">{copy.auth.nameLabel}</span>
                  <Input
                    autoComplete="name"
                    name="name"
                    placeholder={copy.auth.namePlaceholder}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
                </label>
              ) : null}

              <label className="flex flex-col gap-2.5">
                <span className="text-sm font-medium text-foreground">{copy.auth.phoneLabel}</span>
                <Input
                  autoComplete="tel"
                  dir="ltr"
                  inputMode="tel"
                  name="phone"
                  placeholder={copy.auth.phonePlaceholder}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                {errors.phone ? <p className="text-sm text-destructive">{errors.phone}</p> : null}
              </label>

              <label className="flex flex-col gap-2.5">
                <span className="text-sm font-medium text-foreground">{copy.auth.passwordLabel}</span>
                <Input
                  autoComplete="current-password"
                  name="password"
                  placeholder={copy.auth.passwordPlaceholder}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {errors.password ? <p className="text-sm text-destructive">{errors.password}</p> : null}
              </label>

              {isFirstRun && requiresSetupKey ? (
                <label className="flex flex-col gap-2.5">
                  <span className="text-sm font-medium text-foreground">{copy.auth.setupSecretLabel}</span>
                  <Input
                    autoComplete="off"
                    name="setup-secret"
                    placeholder={copy.auth.setupSecretPlaceholder}
                    type="password"
                    value={setupSecret}
                    onChange={(event) => setSetupSecret(event.target.value)}
                  />
                  {errors.setupSecret ? <p className="text-sm text-destructive">{errors.setupSecret}</p> : null}
                </label>
              ) : null}
            </div>

            <Button
              className="mt-2 h-12 w-full rounded-2xl text-base"
              disabled={signInMutation.isPending || bootstrapMutation.isPending}
              type="submit"
            >
              {isFirstRun ? copy.auth.createFirstUser : copy.auth.signIn}
            </Button>
            {authError ? <p className="text-center text-sm text-destructive">{authError}</p> : null}
          </form>
        </section>
      </main>
    )
  }

  if (!derived) {
    return null
  }

  const sidebarWidth = sidebarCollapsed ? "5.5rem" : "18rem"
  const employeePage = page === "employees-create" ? "create" : "list"
  const selectedEmployee = employeeId
    ? derived.employeeRows.find((employee) => employee.id === employeeId) ?? null
    : null
  const selectedProject = projectId
    ? derived.projects.find((project) => project.id === projectId) ?? null
    : null
  const selectedWarehouse = warehouseId
    ? derived.warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null
    : null
  const selectedProjectManagerOptions = selectedProject
    ? includeCurrentManagerOption(derived.projectManagerOptions, {
        id: selectedProject.managerId,
        label: selectedProject.managerName,
      })
    : derived.projectManagerOptions
  const selectedWarehouseManagerOptions = selectedWarehouse
    ? includeCurrentManagerOption(derived.warehouseManagerOptions, {
        id: selectedWarehouse.managerId,
        label: selectedWarehouse.managerName,
      })
    : derived.warehouseManagerOptions

  function renderMissingRecordState(label: string, href: string) {
    return (
      <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{label}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{detailCopy.shared.missingRecordDescription}</p>
          <Button variant="outline" onClick={() => void navigate({ to: href as never })}>
            {detailCopy.shared.back}
          </Button>
        </div>
      </section>
    )
  }

  const breadcrumbItems = [
    { label: copy.sections.dashboard.label, to: "/" },
    ...(page === "employees" || page === "employees-create" || page === "employee-details" || page === "employee-edit"
      ? [{ label: copy.sections.employees.label, to: "/employees" }]
      : page === "projects" || page === "project-details" || page === "project-edit"
        ? [{ label: copy.sections.projects.label, to: "/projects" }]
        : page === "warehouses" || page === "warehouse-details" || page === "warehouse-edit"
          ? [{ label: copy.sections.warehouses.label, to: "/warehouses" }]
          : page === "transactions"
            ? [{ label: copy.sections.transactions.label, to: "/transactions" }]
          : page === "roles"
            ? [{ label: copy.sections.roles.label, to: "/roles" }]
            : page === "settings"
              ? [{ label: copy.sections.settings.label, to: "/settings" }]
              : []),
    ...(page === "employees-create"
      ? [{ label: t("detailPages.employee.createBreadcrumb") }]
      : page === "employee-details" && selectedEmployee
        ? [{ label: selectedEmployee.name }]
      : page === "employee-edit" && selectedEmployee
          ? [{ label: selectedEmployee.name, to: `/employees/${toSafeRouteSegment(selectedEmployee.id)}` }, { label: copy.common.edit }]
          : page === "project-details" && selectedProject
            ? [{ label: selectedProject.name }]
            : page === "project-edit" && selectedProject
              ? [{ label: selectedProject.name, to: `/projects/${toSafeRouteSegment(selectedProject.id)}` }, { label: t("detailPages.project.editBreadcrumb") }]
              : page === "warehouse-details" && selectedWarehouse
                ? [{ label: selectedWarehouse.name }]
                : page === "warehouse-edit" && selectedWarehouse
                  ? [{ label: selectedWarehouse.name, to: `/warehouses/${toSafeRouteSegment(selectedWarehouse.id)}` }, { label: t("detailPages.warehouse.editBreadcrumb") }]
                  : []),
  ]

  return (
    <div className="min-h-screen overflow-hidden">
      <WorkspaceSidebar
        collapseLabel={copy.shell.collapse}
        collapsed={sidebarCollapsed}
        currentPage={page}
        dashboardLabel={copy.sections.dashboard.label}
        employeesLabel={copy.sections.employees.label}
        expandLabel={copy.shell.expand}
        projectsLabel={copy.sections.projects.label}
        rolesLabel={copy.sections.roles.label}
        transactionsLabel={copy.sections.transactions.label}
        session={session}
        settingsLabel={copy.sections.settings.label}
        signOutLabel={copy.shell.signOut}
        theme={theme}
        themeToggleLabel={copy.shell.themeToggle}
        warehousesLabel={copy.sections.warehouses.label}
        width={sidebarWidth}
        onSetCollapsed={setSidebarCollapsed}
        onSignOut={() => setSignOutOpen(true)}
        onToggleTheme={handleThemeToggle}
      />

      <main className="h-screen overflow-y-auto" style={{ paddingRight: sidebarWidth }}>
        <div className="flex min-h-full min-w-0 flex-col gap-6 pb-8 pr-5 pt-5 pl-0">
          {page !== "dashboard" ? <WorkspaceBreadcrumbs items={breadcrumbItems} /> : null}

          {page === "dashboard" ? (
            <DashboardSection
              labels={{
                title: copy.dashboard.title,
                description: copy.dashboard.description,
                workers: copy.metrics.workers,
                projects: copy.metrics.projects,
                warehouses: copy.metrics.warehouses,
                roles: copy.metrics.roles,
              }}
              metrics={derived.metrics}
            />
          ) : null}

          {page === "employees" || page === "employees-create" ? (
            <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
              <EmployeesSection
                actionLabels={{
                  view: copy.common.view,
                  edit: copy.common.edit,
                  leave: copy.common.leave,
                  delete: copy.common.delete,
                  leaveTitle: copy.shell.leaveTitle,
                  leaveDescription: copy.shell.leaveDescription,
                  deleteTitle: copy.shell.deleteEmployeeTitle,
                  deleteDescription: copy.shell.deleteEmployeeDescription,
                }}
                addWorkerLabel={copy.shell.addWorker}
                columns={{
                  name: copy.columns.name,
                  role: copy.columns.role,
                  manager: copy.columns.manager,
                  project: copy.columns.project,
                  phone: copy.columns.phone,
                  status: copy.columns.status,
                  actions: copy.common.actions,
                }}
                createHref="/employees/create"
                description={copy.sections.employees.description}
                employeePage={employeePage}
                emptyLabel={copy.shell.empty}
                managerOptions={derived.managerOptions}
                roles={derived.roles}
                rows={derived.employeeRows}
                title={copy.sections.employees.label}
              />
            </section>
          ) : null}

          {page === "employee-details" ? (
            selectedEmployee ? (
              <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
                <EmployeeDetailsPage
                  activeTab={detailTab ?? "personal"}
                  employee={selectedEmployee}
                  managedProjects={derived.managedProjectsByEmployeeId[selectedEmployee.id] ?? []}
                  managedWarehouses={derived.managedWarehousesByEmployeeId[selectedEmployee.id] ?? []}
                  onTabChange={(tabId) =>
                    void navigate({
                      to: "/employees/$employeeId" as never,
                      params: { employeeId: selectedEmployee.id } as never,
                      search: { tab: tabId } as never,
                    })
                  }
                  salaryPayments={derived.salaryPaymentsByEmployeeId[selectedEmployee.id] ?? []}
                  workHistory={derived.workHistoryByEmployeeId[selectedEmployee.id] ?? []}
                />
              </section>
            ) : (
              renderMissingRecordState(t("detailPages.employee.fileTitle"), "/employees")
            )
          ) : null}

          {page === "employee-edit" ? (
            selectedEmployee ? (
              <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
                <EmployeeEditPage
                  currentManagedProjectIds={derived.projects.filter((project) => project.managerId === selectedEmployee.id).map((project) => project.id)}
                  currentManagedWarehouseIds={derived.warehouses.filter((warehouse) => warehouse.managerId === selectedEmployee.id).map((warehouse) => warehouse.id)}
                  employee={selectedEmployee}
                  managedProjectOptions={derived.projects
                    .filter((project) => project.managerId === selectedEmployee.id || (project.status === "ACTIVE" && !project.managerId))
                    .map((project) => ({
                      id: project.id,
                      label: project.name,
                      secondary:
                        project.managerId === selectedEmployee.id
                          ? `${detailCopy.shared.currentlySelected} - ${getArabicStatusLabel(project.status)}`
                          : t("detailPages.shell.activeWorkersCount", { count: project.activeWorkers }),
                    }))}
                  managedWarehouseOptions={derived.warehouses
                    .filter((warehouse) => warehouse.managerId === selectedEmployee.id || (warehouse.status === "ACTIVE" && !warehouse.managerId))
                    .map((warehouse) => ({
                      id: warehouse.id,
                      label: warehouse.name,
                      secondary:
                        warehouse.managerId === selectedEmployee.id
                          ? `${detailCopy.shared.currentlySelected} - ${getArabicStatusLabel(warehouse.status)}`
                          : warehouse.managerName,
                    }))}
                  managerOptions={derived.managerOptions}
                  roles={derived.roles}
                />
              </section>
            ) : (
              renderMissingRecordState(t("detailPages.employee.editTitle"), "/employees")
            )
          ) : null}

          {page === "projects" ? (
            <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
              <ProjectsSection
                addLabel={copy.shell.addProject}
                archiveLabel={copy.common.archive}
                columns={{
                  name: copy.columns.name,
                  manager: copy.columns.manager,
                  location: copy.columns.location,
                  workers: copy.columns.workers,
                  status: copy.columns.status,
                  actions: copy.common.actions,
                }}
                description={copy.sections.projects.description}
                emptyLabel={copy.shell.empty}
                noLocationLabel={copy.shell.noLocation}
                rows={derived.projects}
                title={copy.sections.projects.label}
                viewLabel={copy.common.view}
                editLabel={copy.common.edit}
                onAdd={() => addRecordMutation.mutate("projects")}
                onArchive={(project) =>
                  setPendingDelete({
                    section: "projects",
                    id: project.id,
                    label: project.name,
                  })
                }
                onEdit={(project) => void navigate({ to: "/projects/$projectId/edit" as never, params: { projectId: project.id } as never })}
                onView={(project) => void navigate({ to: "/projects/$projectId" as never, params: { projectId: project.id } as never })}
              />
            </section>
          ) : null}

          {page === "project-details" ? (
            selectedProject ? (
              <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
                <ProjectDetailsPage
                  activeTab={detailTab ?? "overview"}
                  managementHistoryRows={derived.projectManagementHistoryByProjectId[selectedProject.id] ?? []}
                  onTabChange={(tabId) =>
                    void navigate({
                      to: "/projects/$projectId" as never,
                      params: { projectId: selectedProject.id } as never,
                      search: { tab: tabId } as never,
                    })
                  }
                  project={selectedProject}
                  workerRows={derived.projectWorkersByProjectId[selectedProject.id] ?? []}
                />
              </section>
            ) : (
              renderMissingRecordState(t("detailPages.project.fileTitle"), "/projects")
            )
          ) : null}

          {page === "project-edit" ? (
            selectedProject ? (
              <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
                <ProjectEditPage managerOptions={selectedProjectManagerOptions} project={selectedProject} />
              </section>
            ) : (
              renderMissingRecordState(t("detailPages.project.editTitle"), "/projects")
            )
          ) : null}

          {page === "warehouses" ? (
            <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
              <WarehousesSection
                addLabel={copy.shell.addWarehouse}
                archiveLabel={copy.common.archive}
                columns={{
                  name: copy.columns.name,
                  manager: copy.columns.manager,
                  address: copy.columns.address,
                  status: copy.columns.status,
                  actions: copy.common.actions,
                }}
                description={copy.sections.warehouses.description}
                emptyLabel={copy.shell.empty}
                noAddressLabel={copy.shell.noAddress}
                rows={derived.warehouses}
                title={copy.sections.warehouses.label}
                viewLabel={copy.common.view}
                editLabel={copy.common.edit}
                onAdd={() => addRecordMutation.mutate("warehouses")}
                onArchive={(warehouse) =>
                  setPendingDelete({
                    section: "warehouses",
                    id: warehouse.id,
                    label: warehouse.name,
                  })
                }
                onEdit={(warehouse) => void navigate({ to: "/warehouses/$warehouseId/edit" as never, params: { warehouseId: warehouse.id } as never })}
                onView={(warehouse) => void navigate({ to: "/warehouses/$warehouseId" as never, params: { warehouseId: warehouse.id } as never })}
              />
            </section>
          ) : null}

          {page === "transactions" ? (
            <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
              <SystemLogSection
                entries={systemLogQuery.data?.items ?? []}
                filters={systemLogFilters}
                onFiltersChange={setSystemLogFilters}
                title={copy.sections.transactions.label}
              />
            </section>
          ) : null}

          {page === "warehouse-details" ? (
            selectedWarehouse ? (
              <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
                <WarehouseDetailsPage
                  activeTab={detailTab ?? "overview"}
                  managementHistoryRows={derived.warehouseManagementHistoryByWarehouseId[selectedWarehouse.id] ?? []}
                  onTabChange={(tabId) =>
                    void navigate({
                      to: "/warehouses/$warehouseId" as never,
                      params: { warehouseId: selectedWarehouse.id } as never,
                      search: { tab: tabId } as never,
                    })
                  }
                  teamRows={derived.warehouseWorkersByWarehouseId[selectedWarehouse.id] ?? []}
                  warehouse={selectedWarehouse}
                />
              </section>
            ) : (
              renderMissingRecordState(t("detailPages.warehouse.fileTitle"), "/warehouses")
            )
          ) : null}

          {page === "warehouse-edit" ? (
            selectedWarehouse ? (
              <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
                <WarehouseEditPage managerOptions={selectedWarehouseManagerOptions} warehouse={selectedWarehouse} />
              </section>
            ) : (
              renderMissingRecordState(t("detailPages.warehouse.editTitle"), "/warehouses")
            )
          ) : null}

          {page === "roles" ? (
            <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
              <RolesSection
                columns={{
                  name: copy.columns.name,
                  key: copy.columns.key,
                  system: copy.columns.system,
                  description: copy.columns.description,
                }}
                description={copy.sections.roles.description}
                emptyLabel={copy.shell.empty}
                noLabel={copy.common.no}
                roles={derived.roles}
                title={copy.sections.roles.label}
                yesLabel={copy.common.yes}
              />
            </section>
          ) : null}

          {page === "settings" ? (
            <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
              <SettingsSection
                accountCurrentPasswordLabel={copy.shell.settingsAccountCurrentPassword}
                accountCurrentPasswordPlaceholder={copy.shell.settingsAccountCurrentPasswordPlaceholder}
                accountDescription={copy.shell.settingsAccountDescription}
                accountNameLabel={copy.shell.settingsAccountName}
                accountNamePlaceholder={copy.shell.settingsAccountNamePlaceholder}
                accountNewPasswordLabel={copy.shell.settingsAccountNewPassword}
                accountNewPasswordPlaceholder={copy.shell.settingsAccountNewPasswordPlaceholder}
                accountPhoneLabel={copy.shell.settingsAccountPhone}
                accountPhoneHint={copy.shell.settingsAccountPhoneHint}
                accountPhonePlaceholder={copy.shell.settingsAccountPhonePlaceholder}
                accountSaveLabel={copy.shell.settingsAccountSave}
                accountTitle={copy.shell.settingsAccountTitle}
                currentName={session.name ?? ""}
                currentPhone={session.phone}
                description={copy.sections.settings.description}
                isSavingAccount={updateAccountSettingsMutation.isPending}
                resetDescription={copy.shell.settingsResetDescription}
                resetLabel={copy.shell.resetWorkspace}
                themeDescription={copy.shell.settingsThemeDescription}
                themeLabel={copy.shell.themeToggle}
                themeValueLabel={theme === "light" ? copy.shell.themeDark : copy.shell.themeLight}
                title={copy.sections.settings.label}
                onSaveAccount={(input) => updateAccountSettingsMutation.mutate(input)}
                onReset={() => resetWorkspaceMutation.mutate()}
                onToggleTheme={handleThemeToggle}
              />
            </section>
          ) : null}
        </div>
      </main>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => (!open ? setPendingDelete(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.shell.destructiveTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.shell.destructiveDescription}
              {pendingDelete ? ` ${pendingDelete.label}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{copy.common.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.shell.signOutTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.shell.signOutDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignOut}>{copy.common.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
