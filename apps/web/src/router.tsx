import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { HomeView, type HomeViewPage } from "@/features/app-shell/home-view"
import { AppProviders } from "@/providers/app-providers"

function RootLayout() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  )
}

function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 text-center" dir="rtl">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">الصفحة غير موجودة</h2>
      <p className="mt-2 text-muted-foreground">عذرًا، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
      <a href="/" className="mt-8 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
        العودة إلى الرئيسية
      </a>
    </div>
  )
}

function createWorkspaceRoute(path: string, page: HomeViewPage) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <HomeView page={page} />,
  })
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const dashboardRoute = createWorkspaceRoute("/", "dashboard")
const employeesRoute = createWorkspaceRoute("/employees", "employees")
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
  return <HomeView detailTab={search.tab} employeeId={employeeId} page="employee-details" />
}

function EmployeeEditRouteComponent() {
  const { employeeId } = employeeEditRoute.useParams()
  return <HomeView employeeId={employeeId} page="employee-edit" />
}

function ExternalDetailsRouteComponent() {
  const { externalId } = externalDetailsRoute.useParams()
  return <HomeView counterpartyId={externalId} page="external-details" />
}

function ProjectDetailsRouteComponent() {
  const { projectId } = projectDetailsRoute.useParams()
  const search = projectDetailsRoute.useSearch()
  return <HomeView detailTab={search.tab} page="project-details" projectId={projectId} />
}

function ProjectEditRouteComponent() {
  const { projectId } = projectEditRoute.useParams()
  return <HomeView page="project-edit" projectId={projectId} />
}

function WarehouseDetailsRouteComponent() {
  const { warehouseId } = warehouseDetailsRoute.useParams()
  const search = warehouseDetailsRoute.useSearch()
  return <HomeView detailTab={search.tab} page="warehouse-details" warehouseId={warehouseId} />
}

function WarehouseEditRouteComponent() {
  const { warehouseId } = warehouseEditRoute.useParams()
  return <HomeView page="warehouse-edit" warehouseId={warehouseId} />
}

function InvoiceDetailsRouteComponent() {
  const { invoiceId } = invoiceDetailsRoute.useParams()
  return <HomeView invoiceId={invoiceId} page="invoice-details" />
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
  transactionsRoute,
  warehouseDetailsRoute,
  warehouseEditRoute,
  invoiceDetailsRoute,
  rolesRoute,
  settingsRoute,
])

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
