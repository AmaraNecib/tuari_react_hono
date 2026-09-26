/**
 * Detail page content for the home view.
 * Lazy-loads detail pages based on route.
 */
import { lazy, Suspense, type ReactNode } from "react"

import { LoadErrorSurface } from "@/features/shared/load-error-surface"
import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { workspaceRoutes } from "@/router/navigation"
import {
  buildDebtsHubRows,
  buildExternalCounterpartyRows,
  useDebtPartyDetailQuery,
  useDebtsSummaryQuery,
} from "@/features/debts/debts-queries"
import type { DebtsSummary } from "@tuari/contracts"

import type { HomeViewPageContentProps } from "./home-view-page-content-shared"
import { MissingRecordState } from "./home-view-page-content-shared"

const EMPTY_DEBTS_SUMMARY: DebtsSummary = { parties: [], debtAccounts: [] }

const DebtsHubPage = lazy(async () => import("@/features/debts/debts-hub-page").then((module) => ({ default: module.DebtsHubPage })))
const DebtCreatePage = lazy(async () => import("@/features/debts/debt-create-page").then((module) => ({ default: module.DebtCreatePage })))
const ExternalCounterpartyCreatePage = lazy(async () => import("@/features/externals/external-create-page").then((module) => ({ default: module.ExternalCounterpartyCreatePage })))
const ExternalCounterpartyDetailsPage = lazy(async () => import("@/features/externals/external-details-page").then((module) => ({ default: module.ExternalCounterpartyDetailsPage })))
const ExternalCounterpartiesPage = lazy(async () => import("@/features/externals/externals-page").then((module) => ({ default: module.ExternalCounterpartiesPage })))
const EmployeeDetailsPage = lazy(async () => import("@/features/employees/employee-details-page").then((module) => ({ default: module.EmployeeDetailsPage })))
const EmployeeEditPage = lazy(async () => import("@/features/employees/employee-edit-page").then((module) => ({ default: module.EmployeeEditPage })))
const ProjectDetailsPage = lazy(async () => import("@/features/projects/project-details-page").then((module) => ({ default: module.ProjectDetailsPage })))
const ProjectCreatePage = lazy(async () => import("@/features/projects/project-create-page").then((module) => ({ default: module.ProjectCreatePage })))
const ProjectEditPage = lazy(async () => import("@/features/projects/project-edit-page").then((module) => ({ default: module.ProjectEditPage })))
const InventoryItemDefinitionsPage = lazy(async () => import("@/features/inventory/inventory-item-definitions-page").then((module) => ({ default: module.InventoryItemDefinitionsPage })))
const InventoryInvoiceCreatePage = lazy(async () => import("@/features/inventory/inventory-invoice-create-page").then((module) => ({ default: module.InventoryInvoiceCreatePage })))
const InventoryInvoiceDetailsPage = lazy(async () => import("@/features/inventory/inventory-invoice-details-page").then((module) => ({ default: module.InventoryInvoiceDetailsPage })))
const InventoryInvoicesPage = lazy(async () => import("@/features/inventory/inventory-invoices-page").then((module) => ({ default: module.InventoryInvoicesPage })))
const OutboundTransfersPage = lazy(async () => import("@/features/inventory/outbound-transfers-page").then((module) => ({ default: module.OutboundTransfersPage })))
const OutboundTransferCreatePage = lazy(async () => import("@/features/inventory/outbound-transfer-create-page").then((module) => ({ default: module.OutboundTransferCreatePage })))
const OutboundTransferCreatePageV2 = lazy(async () => import("@/features/inventory/outbound-transfer-create-page-v2").then((module) => ({ default: module.OutboundTransferCreatePageV2 })))
const TransferHistoryPage = lazy(async () => import("@/features/inventory/transfer-history-page").then((module) => ({ default: module.TransferHistoryPage })))
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

  // Debts-domain queries are feature-scoped (@/features/debts/debts-queries)
  // so the hub/detail pages stay fresh under the debts mutations' key
  // invalidation instead of the stale composite snapshot (issue #177 Phase 4).
  const debtsSummaryQuery = useDebtsSummaryQuery({
    enabled: page === "debts" || page === "externals",
  })
  const employeeDebtsDetailQuery = useDebtPartyDetailQuery(
    "INTERNAL_WORKER",
    selectedEmployee?.id,
    { enabled: page === "employee-details" && (detailTab ?? "personal") === "debts" },
  )
  const externalDebtsDetailQuery = useDebtPartyDetailQuery(
    "EXTERNAL_COUNTERPARTY",
    selectedCounterparty?.id,
    { enabled: page === "external-details" && Boolean(selectedCounterparty) },
  )
  const debtsSummary = debtsSummaryQuery.data ?? EMPTY_DEBTS_SUMMARY

  switch (page) {
    case "debts":
      if (debtsSummaryQuery.isPending) {
        return renderLazy(detailPageFallback)
      }
      if (debtsSummaryQuery.isError) {
        return renderLazy(<LoadErrorSurface message={t("debts.loadError")} retryLabel={t("common.retry")} onRetry={() => void debtsSummaryQuery.refetch()} />)
      }
      {
        const hub = buildDebtsHubRows(debtsSummary, derived.externalCounterparties)
        return renderLazy(
          <DebtsHubPage
            rows={hub.rows}
            totals={hub.totals}
            onCreateDebt={() => void navigation.goToDebtCreate()}
            onOpenExternalCounterparty={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)}
            onOpenWorker={(employeeId) => void navigation.goToEmployeeDebts(employeeId)}
          />,
        )
      }

    case "debt-create":
      return renderLazy(
        <DebtCreatePage
          employees={derived.employeeRows}
          externalCounterparties={derived.externalCounterparties}
          navigation={navigation}
        />,
      )

    case "externals":
      if (debtsSummaryQuery.isPending) {
        return renderLazy(detailPageFallback)
      }
      if (debtsSummaryQuery.isError) {
        return renderLazy(<LoadErrorSurface message={t("debts.loadError")} retryLabel={t("common.retry")} onRetry={() => void debtsSummaryQuery.refetch()} />)
      }
      return renderLazy(
        <ExternalCounterpartiesPage
          counterparties={buildExternalCounterpartyRows(debtsSummary, derived.externalCounterparties)}
          onCreate={() => void navigation.goToExternalCreate()}
          onOpen={(counterpartyId) => void navigation.goToExternalDetails(counterpartyId)}
        />,
      )

    case "employee-details":
      if (selectedEmployee && (detailTab ?? "personal") === "debts") {
        if (employeeDebtsDetailQuery.isPending) {
          return renderLazy(detailPageFallback)
        }
        if (employeeDebtsDetailQuery.isError) {
          return renderLazy(
            <LoadErrorSurface message={t("debts.loadError")} retryLabel={t("common.retry")} onRetry={() => void employeeDebtsDetailQuery.refetch()} />,
          )
        }
      }
      return selectedEmployee
        ? renderLazy(
            <EmployeeDetailsPage
              activeTab={detailTab ?? "personal"}
              debtAccounts={employeeDebtsDetailQuery.data?.accounts ?? []}
              debtEntriesByAccountId={employeeDebtsDetailQuery.data?.entriesByAccountId ?? {}}
              employee={selectedEmployee}
              managedProjects={derived.managedProjectsByEmployeeId[selectedEmployee.id] ?? []}
              managedWarehouses={derived.managedWarehousesByEmployeeId[selectedEmployee.id] ?? []}
              salaryPayments={derived.salaryPaymentsByEmployeeId[selectedEmployee.id] ?? []}
              workHistory={derived.workHistoryByEmployeeId[selectedEmployee.id] ?? []}
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
      if (selectedCounterparty) {
        if (externalDebtsDetailQuery.isPending) {
          return renderLazy(detailPageFallback)
        }
        if (externalDebtsDetailQuery.isError) {
          return renderLazy(
            <LoadErrorSurface message={t("debts.loadError")} retryLabel={t("common.retry")} onRetry={() => void externalDebtsDetailQuery.refetch()} />,
          )
        }
      }
      return selectedCounterparty
        ? renderLazy(
            <ExternalCounterpartyDetailsPage
              counterparty={selectedCounterparty}
              debtAccounts={externalDebtsDetailQuery.data?.accounts ?? []}
              debtEntriesByAccountId={externalDebtsDetailQuery.data?.entriesByAccountId ?? {}}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.externals()}
              title="ملف الطرف الخارجي"
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
      return renderLazy(<ProjectCreatePage managerOptions={selectedProjectManagerOptions} />)

    case "project-edit":
      return selectedProject
        ? renderLazy(<ProjectEditPage managerOptions={selectedProjectManagerOptions} project={selectedProject} />)
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
      return renderLazy(<WarehouseCreatePage managerOptions={selectedWarehouseManagerOptions} />)

    case "warehouse-edit":
      return selectedWarehouse
        ? renderLazy(<WarehouseEditPage managerOptions={selectedWarehouseManagerOptions} warehouse={selectedWarehouse} />)
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.warehouses()}
              title={t("detailPages.warehouse.editTitle")}
            />
          )

    case "inventory":
      return renderLazy(<InventoryItemDefinitionsPage />)

    case "invoices":
      return renderLazy(
        <InventoryInvoicesPage
          onCreate={() => void navigation.goToInvoiceCreate()}
          onOpen={(invoiceId) => void navigation.goToInvoiceDetails(invoiceId)}
        />,
      )

    case "invoice-create":
      return renderLazy(
        <InventoryInvoiceCreatePage onCreated={(invoiceId) => void navigation.goToInvoiceDetails(invoiceId)} />,
      )

    case "invoice-details":
      return selectedInvoiceId
        ? renderLazy(
            <InventoryInvoiceDetailsPage
              invoiceId={selectedInvoiceId}
              onBack={() => void navigation.goToInvoices()}
            />,
          )
        : (
            <MissingRecordState
              backLabel={detailCopy.shared.back}
              description={detailCopy.shared.missingRecordDescription}
              navigation={navigation}
              target={workspaceRoutes.invoices()}
              title="تفاصيل الفاتورة"
            />
          )

    case "outbound-transfers":
      return renderLazy(
        <OutboundTransfersPage
          onCreate={() => void navigation.goToOutboundTransferCreate()}
          onCreateV2={() => void navigation.goToOutboundTransferCreateV2()}
        />,
      )

    case "outbound-transfer-create":
      return renderLazy(
        <OutboundTransferCreatePage
          onBack={() => void navigation.goToOutboundTransfers()}
        />,
      )

    case "outbound-transfer-create-v2":
      return renderLazy(
        <OutboundTransferCreatePageV2
          onBack={() => void navigation.goToOutboundTransfers()}
        />,
      )

    case "transfer-history":
      return renderLazy(<TransferHistoryPage />)

    default:
      return null
  }
}
