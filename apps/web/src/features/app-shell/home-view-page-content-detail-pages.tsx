/**
 * Detail page content for the home view.
 * Lazy-loads detail pages based on route.
 */
import { lazy, Suspense, type ReactNode } from "react"

import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { workspaceRoutes } from "@/router/navigation"
import { ExternalCounterpartiesRoute } from "@/features/externals/external-counterparties-route"
import { financialClient } from "@/lib/orpc-client"

import type { HomeViewPageContentProps } from "./home-view-page-content-shared"
import { MissingRecordState } from "./home-view-page-content-shared"

const ExactInventoryPage = lazy(async () => import("@/features/inventory/inventory-exact-page").then(module => ({ default: module.ExactInventoryPage })))
const TransferHistoryPage = lazy(async () => import("@/features/inventory/transfer-history-page").then((module) => ({ default: module.TransferHistoryPage })))
const ExactFinancialRoutePage = lazy(async () => import("@/features/shared/exact-financial-route").then((module) => ({ default: module.ExactFinancialRoutePage })))
const ExternalCounterpartyCreatePage = lazy(async () => import("@/features/externals/external-create-page").then((module) => ({ default: module.ExternalCounterpartyCreatePage })))
const ExternalCounterpartyDetailsPage = lazy(async () => import("@/features/externals/external-details-page").then((module) => ({ default: module.ExternalCounterpartyDetailsPage })))
const EmployeeDetailsPage = lazy(async () => import("@/features/employees/employee-details-page").then((module) => ({ default: module.EmployeeDetailsPage })))
const EmployeeEditPage = lazy(async () => import("@/features/employees/employee-edit-page").then((module) => ({ default: module.EmployeeEditPage })))
const EmployeeEarningApprovalPage = lazy(async () => import("@/features/employees/employee-earning-approval-page").then((module) => ({ default: module.EmployeeEarningApprovalPage })))
const ProjectDetailsPage = lazy(async () => import("@/features/projects/project-details-page").then((module) => ({ default: module.ProjectDetailsPage })))
const ProjectCreatePage = lazy(async () => import("@/features/projects/project-create-page").then((module) => ({ default: module.ProjectCreatePage })))
const ProjectEditPage = lazy(async () => import("@/features/projects/project-edit-page").then((module) => ({ default: module.ProjectEditPage })))
const WarehouseDetailsPage = lazy(async () => import("@/features/warehouses/warehouse-details-page").then((module) => ({ default: module.WarehouseDetailsPage })))
const WarehouseCreatePage = lazy(async () => import("@/features/warehouses/warehouse-create-page").then((module) => ({ default: module.WarehouseCreatePage })))
const WarehouseEditPage = lazy(async () => import("@/features/warehouses/warehouse-edit-page").then((module) => ({ default: module.WarehouseEditPage })))

const detailPageFallback = (
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

function renderLazy(node: ReactNode) {
  return <Suspense fallback={detailPageFallback}>{node}</Suspense>
}

/**
 * @description Component
 */
export function HomeViewPageDetailContent({
  copy,
  derived,
  detailTab,
  earningApproval,
  returnTo,
  navigation,
  page,
  selectedInvoiceId,
  selectedCounterparty,
  selectedEmployeeManagerOptions,
  selectedEmployee,
  selectedProject,
  selectedProjectManagerOptions,
  selectedWarehouse,
  selectedWarehouseManagerOptions,
  t,
}: Pick<
  HomeViewPageContentProps,
  | "copy"
  | "derived"
  | "detailTab"
  | "earningApproval"
  | "returnTo"
  | "navigation"
  | "page"
  | "selectedCounterparty"
  | "selectedEmployee"
  | "selectedProject"
  | "selectedWarehouse"
  | "t"
> & {
  selectedInvoiceId?: string
  selectedEmployeeManagerOptions: HomeViewPageContentProps["derived"]["managerOptions"]
  selectedProjectManagerOptions: HomeViewPageContentProps["derived"]["projectManagerOptions"]
  selectedWarehouseManagerOptions: HomeViewPageContentProps["derived"]["warehouseManagerOptions"]
}) {
  const detailCopy = copy.detailPages

  // The inline "create a manager" flow needs the real project_manager role id
  // (the create contract requires a role, and the API only accepts system
  // workforce labels). The role list already rides the workspace snapshot.
  const projectManagerRoleId = derived.roles.find((role) => role.key === "project_manager")?.id ?? ""
  const warehouseManagerRoleId = derived.roles.find((role) => role.key === "warehouse_manager")?.id ?? ""

  switch (page) {
    case "debts":
    case "debt-create":
      return renderLazy(<ExactFinancialRoutePage
        route="debts"
        payrollEmployees={derived.employeeRows.map(employee => ({ id: employee.id, label: employee.name }))}
        parties={[
          ...derived.employeeRows.map(employee => ({ id: employee.id, label: employee.name, phone: employee.phone, type: "WORKER" as const })),
          ...derived.externalCounterparties.map(party => ({ id: party.id, label: party.fullName, phone: party.phoneNumber, type: "EXTERNAL_COUNTERPARTY" as const })),
        ]}
        locations={[]}
        expenses={{ projects: [], employees: [], sellers: [] }}
      />)

    case "expenses":
      return renderLazy(<ExactFinancialRoutePage
        route="expenses"
        parties={[]}
        locations={[]}
        expenses={{
          projects: derived.projects.map(project => ({ id: project.id, label: project.name })),
          employees: derived.employeeRows.map(employee => ({ id: employee.id, label: employee.name })),
          sellers: derived.externalCounterparties.map(seller => ({ id: seller.id, label: seller.fullName })),
        }}
      />)

    case "externals":
      return renderLazy(<ExternalCounterpartiesRoute
        client={financialClient.debts}
        counterparties={derived.externalCounterparties}
        onCreate={() => void navigation.goToExternalCreate()}
        onOpen={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)}
      />)

    case "employee-details":
      if (earningApproval) {
        const destination = returnTo ?? "employee-finance"
        const goBack = () => {
          if (destination === "salaries") {
            void navigation.goToSalaryWorkers()
          } else if (selectedEmployee) {
            void navigation.goToEmployeeFinance(selectedEmployee.id)
          } else {
            void navigation.goToEmployees()
          }
        }
        return renderLazy(
          <EmployeeEarningApprovalPage
            employee={selectedEmployee}
            projects={derived.salaryProjects}
            returnTo={destination}
            onCancel={goBack}
            onComplete={() => destination === "salaries" ? void navigation.goToSalaryEarnings() : goBack()}
          />,
        )
      }
      return selectedEmployee
        ? renderLazy(
            <EmployeeDetailsPage
              activeTab={detailTab ?? "personal"}
              debtClient={financialClient.debts}
              employee={selectedEmployee}
              managedProjects={derived.managedProjectsByEmployeeId[selectedEmployee.id] ?? []}
              managedWarehouses={derived.managedWarehousesByEmployeeId[selectedEmployee.id] ?? []}
              projects={derived.salaryProjects}
              projectAssignments={derived.projectAssignmentsByEmployeeId[selectedEmployee.id] ?? []}
              workHistory={derived.workHistoryByEmployeeId[selectedEmployee.id] ?? []}
              onApproveEarning={(employeeId) => void navigation.goToEmployeeEarningCreate(employeeId, "employee-finance")}
              onTabChange={(tabId) => void navigation.setEmployeeTab(selectedEmployee.id, tabId)}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.employees()}
              title={t("detailPages.employee.fileTitle")}
            />
          )

    case "external-create":
      return renderLazy(
        <ExternalCounterpartyCreatePage onCreated={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)} />,
      )

    case "external-details":
      return selectedCounterparty
        ? renderLazy(
            <ExternalCounterpartyDetailsPage
              counterparty={selectedCounterparty}
              debtClient={financialClient.debts}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.externals()}
              title={t("shellCopy.externalProfile")}
            />
          )

    case "employee-edit":
      return selectedEmployee
        ? renderLazy(
            <EmployeeEditPage
              currentManagedProjectIds={derived.projects.filter((project) => project.managerId === selectedEmployee.id).map((project) => project.id)}
              currentManagedWarehouseIds={derived.warehouses
                .filter((warehouse) => warehouse.managerId === selectedEmployee.id)
                .map((warehouse) => warehouse.id)}
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
                .filter(
                  (warehouse) => warehouse.managerId === selectedEmployee.id || (warehouse.status === "ACTIVE" && !warehouse.managerId),
                )
                .map((warehouse) => ({
                  id: warehouse.id,
                  label: warehouse.name,
                  secondary:
                    warehouse.managerId === selectedEmployee.id
                      ? `${detailCopy.shared.currentlySelected} - ${getArabicStatusLabel(warehouse.status)}`
                      : warehouse.managerName,
                }))}
              managerOptions={selectedEmployeeManagerOptions}
              roles={derived.roles}
              warehouseOptions={derived.warehouses
                .filter((warehouse) => warehouse.status === "ACTIVE")
                .map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.employees()}
              title={t("detailPages.employee.editTitle")}
            />
          )

    case "project-details":
      return selectedProject
        ? renderLazy(
            <ProjectDetailsPage
              activeTab={detailTab ?? "overview"}
              managementHistoryRows={derived.projectManagementHistoryByProjectId[selectedProject.id] ?? []}
              project={selectedProject}
              workerRows={derived.projectWorkersByProjectId[selectedProject.id] ?? []}
              onTabChange={(tabId) => void navigation.setProjectTab(selectedProject.id, tabId)}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.projects()}
              title={t("detailPages.project.fileTitle")}
            />
          )

    case "project-create":
      return renderLazy(
        <ProjectCreatePage managerOptions={selectedProjectManagerOptions} projectManagerRoleId={projectManagerRoleId} />,
      )

    case "project-edit":
      return selectedProject
        ? renderLazy(
            <ProjectEditPage
              managerOptions={selectedProjectManagerOptions}
              project={selectedProject}
              projectManagerRoleId={projectManagerRoleId}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.projects()}
              title={t("detailPages.project.editTitle")}
            />
          )

    case "warehouse-details":
      return selectedWarehouse
        ? renderLazy(
            <WarehouseDetailsPage
              activeTab={detailTab ?? "overview"}
              managementHistoryRows={derived.warehouseManagementHistoryByWarehouseId[selectedWarehouse.id] ?? []}
              teamRows={derived.warehouseWorkersByWarehouseId[selectedWarehouse.id] ?? []}
              warehouse={selectedWarehouse}
              onTabChange={(tabId) => void navigation.setWarehouseTab(selectedWarehouse.id, tabId)}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.warehouses()}
              title={t("detailPages.warehouse.fileTitle")}
            />
          )

    case "warehouse-create":
      return renderLazy(
        <WarehouseCreatePage managerOptions={selectedWarehouseManagerOptions} warehouseManagerRoleId={warehouseManagerRoleId} />,
      )

    case "warehouse-edit":
      return selectedWarehouse
        ? renderLazy(
            <WarehouseEditPage
              managerOptions={selectedWarehouseManagerOptions}
              warehouse={selectedWarehouse}
              warehouseManagerRoleId={warehouseManagerRoleId}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.warehouses()}
              title={t("detailPages.warehouse.editTitle")}
            />
          )

    case "transfer-history":
      return renderLazy(<TransferHistoryPage />)

    case "inventory":
    case "outbound-transfers":
    case "outbound-transfer-create":
    case "outbound-transfer-create-v2":
      return renderLazy(<ExactFinancialRoutePage
        route="inventory"
        parties={derived.externalCounterparties.map(party => ({ id: party.id, label: party.fullName, type: "EXTERNAL_COUNTERPARTY" as const }))}
        locations={[
          ...derived.warehouses.map(row => ({ id: row.id, label: row.name, type: "WAREHOUSE" as const })),
          ...derived.projects.map(row => ({ id: row.id, label: row.name, type: "PROJECT" as const })),
        ]}
        expenses={{ projects: [], employees: [], sellers: [] }}
        initialInventoryMovement={page === "outbound-transfer-create" || page === "outbound-transfer-create-v2"}
      />)

    case "invoices":
      return renderLazy(<ExactInventoryPage client={financialClient.inventory} locations={[
        ...derived.warehouses.map(row => ({ id: row.id, label: row.name, type: "WAREHOUSE" as const })),
        ...derived.projects.map(row => ({ id: row.id, label: row.name, type: "PROJECT" as const })),
      ]} parties={derived.externalCounterparties.map(party => ({ id: party.id, label: party.fullName }))} />)

    case "invoice-create":
    case "invoice-details":
      if (page === "invoice-details" && !selectedInvoiceId) return <MissingRecordState backLabel={t("exactCommerce.backToInvoices")} description={detailCopy.shared.missingRecordDescription} navigation={navigation} target={workspaceRoutes.invoices()} title={t("inventoryPage.invoices.title")} />
      return renderLazy(<ExactInventoryPage key={page === "invoice-create" ? "create" : selectedInvoiceId} client={financialClient.inventory} initialCreate={page === "invoice-create"} onReturnToInvoices={() => void navigation.goToInvoices()} initialInvoiceId={page === "invoice-details" ? selectedInvoiceId : undefined} locations={[
        ...derived.warehouses.map(row => ({ id: row.id, label: row.name, type: "WAREHOUSE" as const })),
        ...derived.projects.map(row => ({ id: row.id, label: row.name, type: "PROJECT" as const })),
      ]} parties={derived.externalCounterparties.map(party => ({ id: party.id, label: party.fullName }))} />)

    default:
      return null
  }
}
