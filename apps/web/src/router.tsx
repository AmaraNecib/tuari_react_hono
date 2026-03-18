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
const projectsRoute = createWorkspaceRoute("/projects", "projects")
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
const rolesRoute = createWorkspaceRoute("/roles", "roles")
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

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  employeesRoute,
  employeesCreateRoute,
  employeeDetailsRoute,
  employeeEditRoute,
  projectsRoute,
  projectDetailsRoute,
  projectEditRoute,
  warehousesRoute,
  transactionsRoute,
  warehouseDetailsRoute,
  warehouseEditRoute,
  rolesRoute,
  settingsRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
