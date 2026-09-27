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
// RolesSection is intentionally NOT imported/routed for now (issue #20): the
// role add/edit surface is hidden as a 404. The component file roles-section.tsx
// is kept for a future role-management surface.
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
              invoices: copy.metrics.invoices,
              outstandingDebts: copy.metrics.outstandingDebts,
              items: copy.metrics.items,
              counterparties: copy.metrics.counterparties,
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
          projects={derived.salaryProjects}
          projectAssignmentsByEmployeeId={derived.projectAssignmentsByEmployeeId}
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
          projects={derived.salaryProjects}
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
      // The role add/edit surface is hidden for now (issue #20): the admin
      // orchestrates the workforce via the assignment UI, and roles are
      // seeded defaults. Treat the roles page as a 404 like any nonexistent
      // route — the RolesSection component is kept (not deleted) for a future
      // surface where role permissions can be managed/granted.
      return (
        <Surface className="py-12 text-center" role="alert" variant="panel">
          <p className="text-lg font-semibold text-foreground">
            {copy.shell.pageNotFound}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.shell.pageNotFoundDescription}</p>
        </Surface>
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
