import { useNavigate } from "@tanstack/react-router"

import { createWorkspaceNavigator, workspaceRoutes } from "@/router/navigation"

/** Navigation helpers for workspace pages. */
export function useHomeViewNavigation() {
  const goToRoute = createWorkspaceNavigator(useNavigate())

  return {
    goToRoute,
    goToEmployees: () => goToRoute(workspaceRoutes.employees()),
    goToEmployeeCreate: () => goToRoute(workspaceRoutes.employeeCreate()),
    goToEmployeeDetails: (employeeId: string) => goToRoute(workspaceRoutes.employeeDetails(employeeId)),
    goToEmployeeEdit: (employeeId: string) => goToRoute(workspaceRoutes.employeeEdit(employeeId)),
    goToEmployeeFinance: (employeeId: string) => goToRoute(workspaceRoutes.employeeTab(employeeId, "finance")),
    goToEmployeeDebts: (employeeId: string) => goToRoute(workspaceRoutes.employeeTab(employeeId, "debts")),
    setEmployeeTab: (employeeId: string, tab: string) => goToRoute(workspaceRoutes.employeeTab(employeeId, tab)),
    goToDebts: () => goToRoute(workspaceRoutes.debts()),
    goToDebtCreate: () => goToRoute(workspaceRoutes.debtCreate()),
    goToExternals: () => goToRoute(workspaceRoutes.externals()),
    goToExternalCreate: () => goToRoute(workspaceRoutes.externalCreate()),
    goToExternalDetails: (externalId: string) =>
      goToRoute(workspaceRoutes.externalDetails(externalId)),
    goToProjectDetails: (projectId: string) => goToRoute(workspaceRoutes.projectDetails(projectId)),
    goToProjectEdit: (projectId: string) => goToRoute(workspaceRoutes.projectEdit(projectId)),
    goToProjectCreate: () => goToRoute(workspaceRoutes.projectCreate()),
    goToProjects: () => goToRoute(workspaceRoutes.projects()),
    setProjectTab: (projectId: string, tab: string) => goToRoute(workspaceRoutes.projectTab(projectId, tab)),
    goToWarehouseDetails: (warehouseId: string) => goToRoute(workspaceRoutes.warehouseDetails(warehouseId)),
    goToWarehouseEdit: (warehouseId: string) => goToRoute(workspaceRoutes.warehouseEdit(warehouseId)),
    goToWarehouseCreate: () => goToRoute(workspaceRoutes.warehouseCreate()),
    goToWarehouses: () => goToRoute(workspaceRoutes.warehouses()),
    setWarehouseTab: (warehouseId: string, tab: string) => goToRoute(workspaceRoutes.warehouseTab(warehouseId, tab)),
    goToInventory: () => goToRoute(workspaceRoutes.inventory()),
    goToInvoices: () => goToRoute(workspaceRoutes.invoices()),
    goToInvoiceCreate: () => goToRoute(workspaceRoutes.invoiceCreate()),
    goToInvoiceDetails: (invoiceId: string) => goToRoute(workspaceRoutes.invoiceDetails(invoiceId)),
    goToOutboundTransfers: () => goToRoute(workspaceRoutes.outboundTransfers()),
    goToOutboundTransferCreate: () => goToRoute(workspaceRoutes.outboundTransferCreate()),
    goToOutboundTransferCreateV2: () => goToRoute(workspaceRoutes.outboundTransferCreateV2()),
    goToTransferHistory: () => goToRoute(workspaceRoutes.transferHistory()),
  }
}
