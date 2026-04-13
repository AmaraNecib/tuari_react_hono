import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { DebtsHubPage } from "@/features/debts/debts-hub-page"
import { DebtCreatePage } from "@/features/debts/debt-create-page"
import { ExternalCounterpartyCreatePage } from "@/features/externals/external-create-page"
import { ExternalCounterpartyDetailsPage } from "@/features/externals/external-details-page"
import { ExternalCounterpartiesPage } from "@/features/externals/externals-page"
import { EmployeeDetailsPage } from "@/features/employees/employee-details-page"
import { EmployeeEditPage } from "@/features/employees/employee-edit-page"
import { ProjectDetailsPage } from "@/features/projects/project-details-page"
import { ProjectCreatePage } from "@/features/projects/project-create-page"
import { ProjectEditPage } from "@/features/projects/project-edit-page"
import { InventoryItemDefinitionsPage } from "@/features/inventory/inventory-item-definitions-page"
import { InventoryInvoiceCreatePage } from "@/features/inventory/inventory-invoice-create-page"
import { InventoryInvoiceDetailsPage } from "@/features/inventory/inventory-invoice-details-page"
import { InventoryInvoicesPage } from "@/features/inventory/inventory-invoices-page"
import { workspaceRoutes } from "@/router/navigation"
import { WarehouseDetailsPage } from "@/features/warehouses/warehouse-details-page"
import { WarehouseCreatePage } from "@/features/warehouses/warehouse-create-page"
import { WarehouseEditPage } from "@/features/warehouses/warehouse-edit-page"

import type { HomeViewPageContentProps } from "./home-view-page-content-shared"
import { MissingRecordState } from "./home-view-page-content-shared"

export function HomeViewPageDetailContent({
  copy,
  derived,
  detailTab,
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

  switch (page) {
    case "debts":
      return (
        <DebtsHubPage
          rows={derived.debtHubRows}
          totals={derived.debtTotals}
          onCreateDebt={() => void navigation.goToDebtCreate()}
          onOpenExternalCounterparty={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)}
          onOpenWorker={(employeeId) => void navigation.goToEmployeeDebts(employeeId)}
        />
      )

    case "debt-create":
      return (
        <DebtCreatePage
          employees={derived.employeeRows}
          externalCounterparties={derived.externalCounterparties}
          navigation={navigation}
        />
      )

    case "externals":
      return (
        <ExternalCounterpartiesPage
          counterparties={derived.externalCounterparties.map((counterparty) => ({
            id: counterparty.id,
            fullName: counterparty.fullName,
            note: counterparty.note,
            openCaseCount: counterparty.openCaseCount,
            phone: counterparty.phone,
            totalBalanceDzd: counterparty.totalBalanceDzd,
            totalCaseCount: counterparty.accounts.length,
          }))}
          onCreate={() => void navigation.goToExternalCreate()}
          onOpen={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)}
        />
      )

    case "employee-details":
      return selectedEmployee ? (
        <EmployeeDetailsPage
          activeTab={detailTab ?? "personal"}
          debtAccounts={derived.debtAccountsByWorkerId.get(selectedEmployee.id) ?? []}
          debtEntriesByAccountId={derived.debtEntriesByAccountId}
          employee={selectedEmployee}
          managedProjects={derived.managedProjectsByEmployeeId[selectedEmployee.id] ?? []}
          managedWarehouses={derived.managedWarehousesByEmployeeId[selectedEmployee.id] ?? []}
          salaryPayments={derived.salaryPaymentsByEmployeeId[selectedEmployee.id] ?? []}
          workHistory={derived.workHistoryByEmployeeId[selectedEmployee.id] ?? []}
          onTabChange={(tabId) => void navigation.setEmployeeTab(selectedEmployee.id, tabId)}
        />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.employees()}
          title={t("detailPages.employee.fileTitle")}
        />
      )

    case "external-create":
      return <ExternalCounterpartyCreatePage onCreated={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)} />

    case "external-details":
      return selectedCounterparty ? (
        <ExternalCounterpartyDetailsPage
          counterparty={selectedCounterparty}
          debtAccounts={derived.debtAccountsByExternalCounterpartyId.get(selectedCounterparty.id) ?? []}
          debtEntriesByAccountId={derived.debtEntriesByAccountId}
        />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.externals()}
          title="ملف الطرف الخارجي"
        />
      )

    case "employee-edit":
      return selectedEmployee ? (
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
        />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.employees()}
          title={t("detailPages.employee.editTitle")}
        />
      )

    case "project-details":
      return selectedProject ? (
        <ProjectDetailsPage
          activeTab={detailTab ?? "overview"}
          managementHistoryRows={derived.projectManagementHistoryByProjectId[selectedProject.id] ?? []}
          project={selectedProject}
          workerRows={derived.projectWorkersByProjectId[selectedProject.id] ?? []}
          onTabChange={(tabId) => void navigation.setProjectTab(selectedProject.id, tabId)}
        />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.projects()}
          title={t("detailPages.project.fileTitle")}
        />
      )

    case "project-create":
      return <ProjectCreatePage managerOptions={selectedProjectManagerOptions} />

    case "project-edit":
      return selectedProject ? (
        <ProjectEditPage managerOptions={selectedProjectManagerOptions} project={selectedProject} />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.projects()}
          title={t("detailPages.project.editTitle")}
        />
      )

    case "warehouse-details":
      return selectedWarehouse ? (
        <WarehouseDetailsPage
          activeTab={detailTab ?? "overview"}
          managementHistoryRows={derived.warehouseManagementHistoryByWarehouseId[selectedWarehouse.id] ?? []}
          teamRows={derived.warehouseWorkersByWarehouseId[selectedWarehouse.id] ?? []}
          warehouse={selectedWarehouse}
          onTabChange={(tabId) => void navigation.setWarehouseTab(selectedWarehouse.id, tabId)}
        />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.warehouses()}
          title={t("detailPages.warehouse.fileTitle")}
        />
      )

    case "warehouse-create":
      return <WarehouseCreatePage managerOptions={selectedWarehouseManagerOptions} />

    case "warehouse-edit":
      return selectedWarehouse ? (
        <WarehouseEditPage managerOptions={selectedWarehouseManagerOptions} warehouse={selectedWarehouse} />
      ) : (
        <MissingRecordState
          backLabel={detailCopy.shared.back}
          description={detailCopy.shared.missingRecordDescription}
          navigation={navigation}
          target={workspaceRoutes.warehouses()}
          title={t("detailPages.warehouse.editTitle")}
        />
      )

    case "inventory":
      return <InventoryItemDefinitionsPage />

    case "invoices":
      return <InventoryInvoicesPage onCreate={() => void navigation.goToInvoiceCreate()} onOpen={(invoiceId) => void navigation.goToInvoiceDetails(invoiceId)} />

    case "invoice-create":
      return <InventoryInvoiceCreatePage onCreated={(invoiceId) => void navigation.goToInvoiceDetails(invoiceId)} />

    case "invoice-details":
      return selectedInvoiceId ? <InventoryInvoiceDetailsPage invoiceId={selectedInvoiceId} onBack={() => void navigation.goToInvoices()} /> : null

    default:
      return null
  }
}
