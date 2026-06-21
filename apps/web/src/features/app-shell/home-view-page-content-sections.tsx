import { Surface } from "@/features/shared/page-primitives"
import { workspaceRoutes } from "@/router/navigation"

import { DashboardSection } from "./dashboard-section"
import { EmployeesSection } from "./employees-section"
import type { HomeViewPageContentProps } from "./home-view-page-content-shared"
import { ProjectsSection } from "./projects-section"
import { RolesSection } from "./roles-section"
import { SalariesSection } from "./salaries-section"
import { SettingsSection } from "./settings-section"
import { SystemLogSection } from "./system-log-section"
import { WarehousesSection } from "./warehouses-section"

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
  page,
  resetWorkspacePending,
  session,
  systemLogFilters,
  systemLogState,
  theme,
  updateAccountPending,
  paginationCursor,
  paginationLimit,
  workspace,
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
  | "paginationCursor"
  | "paginationLimit"
  | "workspace"
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
      return (
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
        </Surface>
      )

    case "employees":
    case "employees-create":
      return (
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
          noManagerLabel={copy.shell.noManager}
          noProjectLabel={copy.shell.noProject}
          roles={derived.roles}
          title={copy.sections.employees.label}
          workspace={workspace!}
        />
      )

    case "projects":
      return (
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
        />
      )

    case "salaries":
      return (
        <SalariesSection
          recentPayments={derived.recentSalaryPayments}
          workers={derived.salariedEmployees}
          onEditSalary={(employeeId) => void navigation.goToEmployeeEdit(employeeId)}
        />
      )

    case "warehouses":
      return (
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
        />
      )

    case "transactions":
      return (
        <SystemLogSection
          entries={systemLogState.entries}
          filters={systemLogFilters}
          isError={systemLogState.isError}
          isLoading={systemLogState.isLoading}
          title={copy.sections.transactions.label}
          onFiltersChange={onSystemLogFiltersChange}
        />
      )

    case "roles":
      return (
        <RolesSection
          columns={{
            name: copy.columns.name,
            key: copy.columns.key,
            system: copy.columns.system,
            description: copy.columns.description,
          }}
          emptyLabel={copy.shell.empty}
          noLabel={copy.common.no}
          roles={derived.roles}
          title={copy.sections.roles.label}
          yesLabel={copy.common.yes}
        />
      )

    case "settings":
      return (
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
          onReset={onResetWorkspace}
          onSaveAccount={onSaveAccount}
          onToggleTheme={onThemeToggle}
        />
      )

    default:
      return null
  }
}
