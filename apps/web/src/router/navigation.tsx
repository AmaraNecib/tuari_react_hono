import type { ComponentProps } from "react"

import { Link } from "@tanstack/react-router"

type WorkspaceTabSearch = { tab: string }

export type WorkspaceRouteTarget =
  | { to: "/" }
  | { to: "/employees" }
  | { to: "/employees/create" }
  | { to: "/employees/$employeeId"; params: { employeeId: string }; search?: WorkspaceTabSearch }
  | { to: "/employees/$employeeId/edit"; params: { employeeId: string } }
  | { to: "/debts" }
  | { to: "/debts/create" }
  | { to: "/externals" }
  | { to: "/externals/create" }
  | { to: "/externals/$externalId"; params: { externalId: string } }
  | { to: "/projects" }
  | { to: "/projects/create" }
  | { to: "/projects/$projectId"; params: { projectId: string }; search?: WorkspaceTabSearch }
  | { to: "/projects/$projectId/edit"; params: { projectId: string } }
  | { to: "/salaries" }
  | { to: "/warehouses" }
  | { to: "/warehouses/create" }
  | { to: "/warehouses/$warehouseId"; params: { warehouseId: string }; search?: WorkspaceTabSearch }
  | { to: "/warehouses/$warehouseId/edit"; params: { warehouseId: string } }
  | { to: "/inventory" }
  | { to: "/invoices" }
  | { to: "/invoices/create" }
  | { to: "/invoices/$invoiceId"; params: { invoiceId: string } }
  | { to: "/outbound-transfers" }
  | { to: "/outbound-transfers/create" }
  | { to: "/transactions" }
  | { to: "/roles" }
  | { to: "/settings" }

type InternalWorkspaceRouteTarget = {
  to: never
  params?: never
  search?: never
}

type WorkspaceLinkProps = Omit<ComponentProps<typeof Link>, "to" | "params" | "search" | "target"> & {
  target: WorkspaceRouteTarget
}

export const workspaceRoutes = {
  dashboard: (): WorkspaceRouteTarget => ({ to: "/" }),
  employees: (): WorkspaceRouteTarget => ({ to: "/employees" }),
  employeeCreate: (): WorkspaceRouteTarget => ({ to: "/employees/create" }),
  employeeDetails: (employeeId: string): WorkspaceRouteTarget => ({
    to: "/employees/$employeeId",
    params: { employeeId },
  }),
  employeeEdit: (employeeId: string): WorkspaceRouteTarget => ({
    to: "/employees/$employeeId/edit",
    params: { employeeId },
  }),
  employeeTab: (employeeId: string, tab: string): WorkspaceRouteTarget => ({
    to: "/employees/$employeeId",
    params: { employeeId },
    search: { tab },
  }),
  debts: (): WorkspaceRouteTarget => ({ to: "/debts" }),
  debtCreate: (): WorkspaceRouteTarget => ({ to: "/debts/create" }),
  externals: (): WorkspaceRouteTarget => ({ to: "/externals" }),
  externalCreate: (): WorkspaceRouteTarget => ({ to: "/externals/create" }),
  externalDetails: (externalId: string): WorkspaceRouteTarget => ({
    to: "/externals/$externalId",
    params: { externalId },
  }),
  projects: (): WorkspaceRouteTarget => ({ to: "/projects" }),
  projectCreate: (): WorkspaceRouteTarget => ({ to: "/projects/create" }),
  projectDetails: (projectId: string): WorkspaceRouteTarget => ({
    to: "/projects/$projectId",
    params: { projectId },
  }),
  projectEdit: (projectId: string): WorkspaceRouteTarget => ({
    to: "/projects/$projectId/edit",
    params: { projectId },
  }),
  projectTab: (projectId: string, tab: string): WorkspaceRouteTarget => ({
    to: "/projects/$projectId",
    params: { projectId },
    search: { tab },
  }),
  salaries: (): WorkspaceRouteTarget => ({ to: "/salaries" }),
  warehouses: (): WorkspaceRouteTarget => ({ to: "/warehouses" }),
  warehouseCreate: (): WorkspaceRouteTarget => ({ to: "/warehouses/create" }),
  inventory: (): WorkspaceRouteTarget => ({ to: "/inventory" }),
  invoices: (): WorkspaceRouteTarget => ({ to: "/invoices" }),
  invoiceCreate: (): WorkspaceRouteTarget => ({ to: "/invoices/create" }),
  invoiceDetails: (invoiceId: string): WorkspaceRouteTarget => ({ to: "/invoices/$invoiceId", params: { invoiceId } }),
  outboundTransfers: (): WorkspaceRouteTarget => ({ to: "/outbound-transfers" }),
  outboundTransferCreate: (): WorkspaceRouteTarget => ({ to: "/outbound-transfers/create" }),
  warehouseDetails: (warehouseId: string): WorkspaceRouteTarget => ({
    to: "/warehouses/$warehouseId",
    params: { warehouseId },
  }),
  warehouseEdit: (warehouseId: string): WorkspaceRouteTarget => ({
    to: "/warehouses/$warehouseId/edit",
    params: { warehouseId },
  }),
  warehouseTab: (warehouseId: string, tab: string): WorkspaceRouteTarget => ({
    to: "/warehouses/$warehouseId",
    params: { warehouseId },
    search: { tab },
  }),
  transactions: (): WorkspaceRouteTarget => ({ to: "/transactions" }),
  roles: (): WorkspaceRouteTarget => ({ to: "/roles" }),
  settings: (): WorkspaceRouteTarget => ({ to: "/settings" }),
} as const

function castWorkspaceRouteTarget(target: WorkspaceRouteTarget): InternalWorkspaceRouteTarget {
  return target as never
}

export function getWorkspaceLinkProps(target: WorkspaceRouteTarget) {
  return castWorkspaceRouteTarget(target)
}

export function createWorkspaceNavigator(navigate: (options: InternalWorkspaceRouteTarget) => unknown) {
  return (target: WorkspaceRouteTarget) => navigate(castWorkspaceRouteTarget(target))
}

export function navigateToWorkspaceRoute(
  navigate: (options: InternalWorkspaceRouteTarget) => unknown,
  target: WorkspaceRouteTarget,
) {
  return createWorkspaceNavigator(navigate)(target)
}

export function WorkspaceLink({ target, ...props }: WorkspaceLinkProps) {
  return <Link {...props} {...getWorkspaceLinkProps(target)} />
}
