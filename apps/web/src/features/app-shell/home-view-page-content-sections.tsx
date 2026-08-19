import { lazy, Suspense, type ReactNode } from "react"
import { Surface } from "@/features/shared/page-primitives"
import { workspaceRoutes } from "@/router/navigation"

import type { HomeViewPageContentProps } from "./home-view-page-content-shared"

// Each workspace section is its own lazy chunk (mirrors the detail-page
// pattern in home-view-page-content-detail-pages.tsx). The first workspace
// page load fetches only its section chunk + shared vendor chunks instead of
// the full ~620 kB home-view bundle (issue #286).
const DashboardSection = lazy(async () => import("./dashboard-section").then((module) => ({ default: module.DashboardSection })))
const EmployeesSection = lazy(async () => import("./employees-section").then((module) => ({ default: module.EmployeesSection })))
const ProjectsSection = lazy(async () => import("./projects-section").then((module) => ({ default: module.ProjectsSection })))
const RolesSection = lazy(async () => import("./roles-section").then((module) => ({ default: module.RolesSection })))
const SalariesSection = lazy(async () => import("./salaries-section").then((module) => ({ default: module.SalariesSection })))
const SettingsSection = lazy(async () => import("./settings-section").then((module) => ({ default: module.SettingsSection })))
const SystemLogSection = lazy(async () => import("./system-log-section").then((module) => ({ default: module.SystemLogSection })))
const WarehousesSection = lazy(async () => import("./warehouses-section").then((module) => ({ default: module.WarehousesSection })))

const sectionFallback = (
  <div
    aria-live="polite"
    className="min-h-[240px] space-y-4 p-6"
    role="status"
  >
    {/* Skeleton shimmer instead of text */}
    <div className="h-8 w-48 animate-pulse rounded-lg bg-ink/5" />
    <div className="h-4 w-64 animate-pulse rounded-lg bg-ink/5" />
    <div className="mt-6 h-32 w-full animate-pulse rounded-xl bg-ink/5" />
    <div className="h-4 w-32 animate-pulse rounded-lg bg-ink/5" />
  </div>
)

function renderSection(node: ReactNode) {
  return <Suspense fallback={sectionFallback}>{node}</Suspense>
}

/** Renders the main content section for each workspace page. */
/**
 * @description Component
 */
export function HomeViewPageSectionContent({
  copy,
  derived,
  navigation,
  onAddProject,
  onAddWarehouse,
  onResetWorkspace,
  onSaveAccount,
  onSetPendingDelete,
  onSystemLogFiltersChange,
  onThemeToggle,
  onUpdateApplied,
  page,
  resetWorkspacePending,
  session,
  systemLogFilters,
  systemLogState,
  theme,
  updateAccountPending,
  paginationCursor,
  paginationLimit,
}: Pick<
  HomeViewPageContentProps,
  | "copy"
  | "derived"
  | "navigation"
  | "onAddProject"
  | "onAddWarehouse"
  | "onResetWorkspace"
  | "onSaveAccount"
  | "onSetPendingDelete"
  | "onSystemLogFiltersChange"
  | "onThemeToggle"
  | "onUpdateApplied"
  | "paginationCursor"
  | "paginationLimit"
  | "paginationPrevCursors"
  | "page"
  | "resetWorkspacePending"
  | "session"
  | "systemLogFilters"
  | "systemLogState"
  | "theme"
  | "updateAccountPending"
>) {
  const employeePage = page === "employees-create" ? "create" : "list"

  switch (page) {
    case "dashboard":
      return renderSection(
        <Surface variant="panel" className="p-6 xl:p-7">
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
        </Surface>,
      )

    case "employees":
    case "employees-create":
      return renderSection(
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
          createTarget={workspaceRoutes.employeeCreate()}
          cursor={paginationCursor}
          employeePage={employeePage}
          emptyLabel={copy.shell.empty}
          limit={paginationLimit}
          managerOptions={derived.managerOptions}
          buildEmployeeTableRow={derived.buildEmployeeTableRow}
          roles={derived.roles}
          title={copy.sections.employees.label}
        />,
      )

    case "projects":
      return renderSection(
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
          editLabel={copy.common.edit}
          emptyLabel={copy.shell.empty}
          noLocationLabel={copy.shell.noLocation}
          rows={derived.projects}
          title={copy.sections.projects.label}
          viewLabel={copy.common.view}
          onAdd={onAddProject}
          onArchive={(project) =>
            onSetPendingDelete({
              section: "projects",
              id: project.id,
              label: project.name,
            })}
          onEdit={(project) => void navigation.goToProjectEdit(project.id)}
          onView={(project) => void navigation.goToProjectDetails(project.id)}
        />,
      )

    case "salaries":
      return renderSection(
        <SalariesSection
          recentPayments={derived.recentSalaryPayments}
          workers={derived.salariedEmployees}
          onEditSalary={(employeeId) => void navigation.goToEmployeeEdit(employeeId)}
        />,
      )

    case "warehouses":
      return renderSection(
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
          editLabel={copy.common.edit}
          emptyLabel={copy.shell.empty}
          noAddressLabel={copy.shell.noAddress}
          rows={derived.warehouses}
          title={copy.sections.warehouses.label}
          viewLabel={copy.common.view}
          onAdd={onAddWarehouse}
          onArchive={(warehouse) =>
            onSetPendingDelete({
              section: "warehouses",
              id: warehouse.id,
              label: warehouse.name,
            })}
          onEdit={(warehouse) => void navigation.goToWarehouseEdit(warehouse.id)}
          onView={(warehouse) => void navigation.goToWarehouseDetails(warehouse.id)}
        />,
      )

    case "transactions":
      return renderSection(
        <SystemLogSection
          entries={systemLogState.entries}
          filters={systemLogFilters}
          isError={systemLogState.isError}
          isLoading={systemLogState.isLoading}
          title={copy.sections.transactions.label}
          onFiltersChange={onSystemLogFiltersChange}
        />,
      )

    case "roles":
      return renderSection(
        <RolesSection
          columns={{
            name: copy.columns.name,
            key: copy.columns.key,
            system: copy.columns.system,
            description: copy.columns.description,
            permissions: copy.shell.rolesPermissions,
          }}
          emptyLabel={copy.shell.empty}
          noLabel={copy.common.no}
          roles={derived.roles}
          title={copy.sections.roles.label}
          yesLabel={copy.common.yes}
        />,
      )

    case "settings":
      return renderSection(
        <SettingsSection
          accountCurrentPasswordLabel={copy.shell.settingsAccountCurrentPassword}
          accountCurrentPasswordPlaceholder={copy.shell.settingsAccountCurrentPasswordPlaceholder}
          accountDescription={copy.shell.settingsAccountDescription}
          accountNameLabel={copy.shell.settingsAccountName}
          accountNamePlaceholder={copy.shell.settingsAccountNamePlaceholder}
          accountNewPasswordLabel={copy.shell.settingsAccountNewPassword}
          accountNewPasswordPlaceholder={copy.shell.settingsAccountNewPasswordPlaceholder}
          accountPhoneHint={copy.shell.settingsAccountPhoneHint}
          accountPhoneLabel={copy.shell.settingsAccountPhone}
          accountPhonePlaceholder={copy.shell.settingsAccountPhonePlaceholder}
          accountSaveLabel={copy.shell.settingsAccountSave}
          accountSavingLabel={copy.shell.settingsAccountSaving}
          accountTitle={copy.shell.settingsAccountTitle}
          currentName={session.name ?? ""}
          currentPhone={session.phone}
          isSavingAccount={updateAccountPending}
          passwordHideLabel={copy.common.hidePassword}
          passwordShowLabel={copy.common.showPassword}
          isResetPending={resetWorkspacePending}
          resetDescription={copy.shell.settingsResetDescription}
          resetLabel={copy.shell.resetWorkspace}
          themeDescription={copy.shell.settingsThemeDescription}
          themeLabel={copy.shell.themeToggle}
          themeValueLabel={theme === "light" ? copy.shell.themeDark : copy.shell.themeLight}
          title={copy.sections.settings.label}
          settingsCheckForUpdates={copy.shell.settingsCheckForUpdates}
          settingsChecking={copy.shell.settingsChecking}
          settingsUpToDate={copy.shell.settingsUpToDate}
          settingsUpdateAvailable={copy.shell.settingsUpdateAvailable}
          settingsUpdateError={copy.shell.settingsUpdateError}
          settingsApplyError={copy.shell.settingsApplyError}
          settingsLastChecked={copy.shell.settingsLastChecked}
          settingsUpdateCached={copy.shell.settingsUpdateCached}
          settingsAboutTitle={copy.shell.settingsAboutTitle}
          settingsAboutVersion={copy.shell.settingsAboutVersion}
          settingsAboutInstallFromFile={copy.shell.settingsAboutInstallFromFile}
          settingsAboutInstallFromFileDescription={copy.shell.settingsAboutInstallFromFileDescription}
          settingsUpdateVerifying={copy.shell.settingsUpdateVerifying}
          settingsUpdateSuccess={copy.shell.settingsUpdateSuccess}
          settingsAboutTab={copy.shell.settingsAboutTab}
          onReset={onResetWorkspace}
          onSaveAccount={onSaveAccount}
          onToggleTheme={onThemeToggle}
          onUpdateApplied={onUpdateApplied}
        />,
      )

    default:
      return null
  }
}
