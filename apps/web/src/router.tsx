// Route definitions for the TauriOS application
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { lazy, Suspense, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { HomeViewPage } from "@/features/app-shell/home-view"
import { AppProviders } from "@/providers/app-providers"
import { AppShellSkeleton } from "@/components/skeleton"

const HomeView = lazy(async () => import("@/features/app-shell/home-view").then((module) => ({ default: module.HomeView })))

function WorkspaceRouteFallback() {
  return <AppShellSkeleton />
}

function renderHomeView(node: ReactNode) {
  return <Suspense fallback={<WorkspaceRouteFallback />}>{node}</Suspense>
}

function RootLayout() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  )
}

function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 text-center" dir="rtl">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">{t("detailPages.notFound.title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("detailPages.notFound.description")}</p>
      <a href="/" className="mt-8 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
        {t("detailPages.notFound.backHome")}
      </a>
    </div>
  )
}

function createWorkspaceRoute(path: string, page: HomeViewPage) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => renderHomeView(<HomeView page={page} />),
  })
}

type EmployeesListSearch = {
  cursor?: string
  limit?: number
  prevCursors?: string
}

function parseEmployeesListSearch(search: Record<string, unknown>): EmployeesListSearch {
  const cursor = typeof search.cursor === "string" && search.cursor.length > 0 ? search.cursor : undefined
  const rawLimit = typeof search.limit === "string" ? Number(search.limit) : (search.limit as number | undefined)
  const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined
  // prevCursors is a comma-separated list of cursors (empty string = page 1 sentinel).
  // We keep it even when it contains only empty-string sentinels.
  const prevCursors = typeof search.prevCursors === "string"
    ? search.prevCursors
    : undefined
  return { cursor, limit, prevCursors }
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const dashboardRoute = createWorkspaceRoute("/", "dashboard")
const employeesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/employees",
  validateSearch: (search: Record<string, unknown>) => parseEmployeesListSearch(search),
  component: EmployeesListRouteComponent,
})
const employeesCreateRoute = createWorkspaceRoute("/employees/create", "employees-create")
const debtsRoute = createWorkspaceRoute("/debts", "debts")
const debtCreateRoute = createWorkspaceRoute("/debts/create", "debt-create")
const externalsRoute = createWorkspaceRoute("/externals", "externals")
const externalCreateRoute = createWorkspaceRoute(
  "/externals/create",
  "external-create",
)
const employeeDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/employees/$employeeId",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : "personal",
  }),
  component: EmployeeDetailsRouteComponent,
})
const employeeEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/employees/$employeeId/edit",
  component: EmployeeEditRouteComponent,
})
const externalDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/externals/$externalId",
  component: ExternalDetailsRouteComponent,
})
const projectsRoute = createWorkspaceRoute("/projects", "projects")
const projectsCreateRoute = createWorkspaceRoute("/projects/create", "project-create")
const salariesRoute = createWorkspaceRoute("/salaries", "salaries")
const projectDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : "overview",
  }),
  component: ProjectDetailsRouteComponent,
})
const projectEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/edit",
  component: ProjectEditRouteComponent,
})
const warehousesRoute = createWorkspaceRoute("/warehouses", "warehouses")
const warehousesCreateRoute = createWorkspaceRoute("/warehouses/create", "warehouse-create")
const inventoryRoute = createWorkspaceRoute("/inventory", "inventory")
const invoicesRoute = createWorkspaceRoute("/invoices", "invoices")
const invoiceCreateRoute = createWorkspaceRoute("/invoices/create", "invoice-create")
const outboundTransfersRoute = createWorkspaceRoute("/outbound-transfers", "outbound-transfers")
const outboundTransferCreateRoute = createWorkspaceRoute("/outbound-transfers/create", "outbound-transfer-create")
const outboundTransferCreateV2Route = createWorkspaceRoute("/outbound-transfers/create-v2", "outbound-transfer-create-v2" as HomeViewPage)
const transferHistoryRoute = createWorkspaceRoute("/transfer-history", "transfer-history" as HomeViewPage)
const transactionsRoute = createWorkspaceRoute("/transactions", "transactions")
const warehouseDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/warehouses/$warehouseId",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : "overview",
  }),
  component: WarehouseDetailsRouteComponent,
})
const warehouseEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/warehouses/$warehouseId/edit",
  component: WarehouseEditRouteComponent,
})
const invoiceDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invoices/$invoiceId",
  component: InvoiceDetailsRouteComponent,
})
const rolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/roles",
  component: NotFoundPage,
})
const settingsRoute = createWorkspaceRoute("/settings", "settings")

function EmployeeDetailsRouteComponent() {
  const { employeeId } = employeeDetailsRoute.useParams()
  const search = employeeDetailsRoute.useSearch()
  return renderHomeView(<HomeView detailTab={search.tab} employeeId={employeeId} page="employee-details" />)
}

function EmployeesListRouteComponent() {
  const search = employeesRoute.useSearch()
  return renderHomeView(
    <HomeView
      page="employees"
      paginationCursor={search.cursor}
      paginationLimit={search.limit}
      paginationPrevCursors={search.prevCursors}
    />,
  )
}

function EmployeeEditRouteComponent() {
  const { employeeId } = employeeEditRoute.useParams()
  return renderHomeView(<HomeView employeeId={employeeId} page="employee-edit" />)
}

function ExternalDetailsRouteComponent() {
  const { externalId } = externalDetailsRoute.useParams()
  return renderHomeView(<HomeView counterpartyId={externalId} page="external-details" />)
}

function ProjectDetailsRouteComponent() {
  const { projectId } = projectDetailsRoute.useParams()
  const search = projectDetailsRoute.useSearch()
  return renderHomeView(<HomeView detailTab={search.tab} page="project-details" projectId={projectId} />)
}

function ProjectEditRouteComponent() {
  const { projectId } = projectEditRoute.useParams()
  return renderHomeView(<HomeView page="project-edit" projectId={projectId} />)
}

function WarehouseDetailsRouteComponent() {
  const { warehouseId } = warehouseDetailsRoute.useParams()
  const search = warehouseDetailsRoute.useSearch()
  return renderHomeView(<HomeView detailTab={search.tab} page="warehouse-details" warehouseId={warehouseId} />)
}

function WarehouseEditRouteComponent() {
  const { warehouseId } = warehouseEditRoute.useParams()
  return renderHomeView(<HomeView page="warehouse-edit" warehouseId={warehouseId} />)
}

function InvoiceDetailsRouteComponent() {
  const { invoiceId } = invoiceDetailsRoute.useParams()
  return renderHomeView(<HomeView invoiceId={invoiceId} page="invoice-details" />)
}

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  employeesRoute,
  employeesCreateRoute,
  debtsRoute,
  debtCreateRoute,
  externalsRoute,
  externalCreateRoute,
  employeeDetailsRoute,
  employeeEditRoute,
  externalDetailsRoute,
  projectsRoute,
  projectsCreateRoute,
  salariesRoute,
  projectDetailsRoute,
  projectEditRoute,
  warehousesRoute,
  warehousesCreateRoute,
  inventoryRoute,
  invoicesRoute,
  invoiceCreateRoute,
  outboundTransfersRoute,
  outboundTransferCreateRoute,
  outboundTransferCreateV2Route,
  transferHistoryRoute,
  transactionsRoute,
  warehouseDetailsRoute,
  warehouseEditRoute,
  invoiceDetailsRoute,
  rolesRoute,
  settingsRoute,
])

/** TanStack Router instance with all routes. */
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFoundPage,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
