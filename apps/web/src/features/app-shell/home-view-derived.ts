import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import {
  buildEmployeeDerivedCollections,
  buildEmployeeRows,
  buildManagerOptions,
  buildWarehouseManagerOptions,
} from "./home-view-derived-employees"
import { buildDebtDerivedCollections } from "./home-view-derived-debts"
import { buildHomeViewDerivedLookups } from "./home-view-derived-lookups"
import {
  buildProjectDerivedCollections,
  buildProjectOptions,
  buildProjectRows,
} from "./home-view-derived-projects"
import {
  buildWarehouseDerivedCollections,
  buildWarehouseOptions,
  buildWarehouseRows,
} from "./home-view-derived-warehouses"
import type { DemoWorkspace } from "./workspace-queries"

type Translate = (key: string, options?: Record<string, unknown>) => string

export function buildHomeViewDerived({
  copy,
  detailCopy,
  t,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  detailCopy: HomeViewDetailCopy
  t: Translate
  workspace: DemoWorkspace
}) {
  const lookups = buildHomeViewDerivedLookups(workspace)
  const employeeRows = buildEmployeeRows({ copy, lookups, t, workspace })
  const projects = buildProjectRows({ copy, lookups, t, workspace })
  const warehouses = buildWarehouseRows({ copy, lookups, t, workspace })
  const managerOptions = buildManagerOptions({ lookups, workspace })
  const warehouseManagerOptions = buildWarehouseManagerOptions({ lookups, workspace })
  let activeWorkers = 0
  let activeProjects = 0
  let visibleWarehouses = 0

  for (const employee of employeeRows) {
    if (employee.status === "ACTIVE" && employee.isWorker) {
      activeWorkers += 1
    }
  }

  for (const project of projects) {
    if (project.status === "ACTIVE") {
      activeProjects += 1
    }
  }

  for (const warehouse of warehouses) {
    if (warehouse.status !== "ARCHIVED") {
      visibleWarehouses += 1
    }
  }

  return {
    employeeRows,
    projects,
    warehouses,
    roles: workspace.roles,
    managerOptions,
    projectManagerOptions: managerOptions,
    warehouseManagerOptions,
    ...buildDebtDerivedCollections({
      employeeRows,
      workspace,
    }),
    ...buildEmployeeDerivedCollections({
      copy,
      detailCopy,
      employeeRows,
      lookups,
      workspace,
    }),
    ...buildProjectDerivedCollections({
      copy,
      detailCopy,
      lookups,
      workspace,
    }),
    ...buildWarehouseDerivedCollections({
      copy,
      detailCopy,
      lookups,
      workspace,
    }),
    projectOptions: buildProjectOptions(workspace),
    warehouseOptions: buildWarehouseOptions(workspace),
    metrics: {
      workers: activeWorkers,
      projects: activeProjects,
      warehouses: visibleWarehouses,
      roles: workspace.roles.length,
    },
  }
}

export type HomeViewDerived = ReturnType<typeof buildHomeViewDerived>
