import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import {
  buildEmployeeDerivedCollections,
  buildEmployeeRelationshipFacts,
  buildEmployeeRows,
  buildManagerOptions,
  buildWarehouseManagerOptions,
  buildEmployeeRow,
} from "./home-view-derived-employees"
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

/** Computes derived workspace data from raw query results. */
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
  const relationshipFacts = buildEmployeeRelationshipFacts(workspace)
  const employeeRows = buildEmployeeRows({ copy, lookups, relationshipFacts, t, workspace })
  const projects = buildProjectRows({ copy, lookups, t, workspace })
  const warehouses = buildWarehouseRows({ copy, lookups, t, workspace })
  const managerOptions = buildManagerOptions({ lookups, workspace })
  const warehouseManagerOptions = buildWarehouseManagerOptions({ lookups, workspace })
  let activeWorkers = 0
  let activeProjects = 0
  let visibleWarehouses = 0
  const counterparties = workspace.externalCounterparties.length

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
    /**
     * Builds a single employee table row against the same workspace-derived
     * context (lookups, relationship facts, shell copy, t) that produced
     * `employeeRows`. This is the single public row-builder for paged/search
     * subsets (e.g. the employees section) — it keeps consumers off the
     * internal home-view-derived-* modules (issue #217).
     */
    buildEmployeeTableRow: (employee: DemoWorkspace["employees"][number]) =>
      buildEmployeeRow({
        copy: { shell: copy.shell },
        employee,
        lookups,
        relationshipFacts,
        t,
      }),
    projects,
    warehouses,
    roles: workspace.roles,
    // Raw counterparty list for shell selection/breadcrumbs and the
    // externals pages. Debts balances/entries are feature-scoped
    // (@/features/debts/debts-queries), not derived here.
    externalCounterparties: workspace.externalCounterparties,
    managerOptions,
    projectManagerOptions: managerOptions,
    warehouseManagerOptions,
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
      counterparties,
    },
  }
}

export type HomeViewDerived = ReturnType<typeof buildHomeViewDerived>
