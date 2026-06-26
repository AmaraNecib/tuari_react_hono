import type { DemoWorkspace } from "./workspace-queries"

/** Builds lookup maps for roles, warehouses, projects. */
export function buildHomeViewDerivedLookups(workspace: DemoWorkspace) {
  return {
    roleById: new Map(workspace.roles.map((role) => [role.id, role])),
    employeeById: new Map(workspace.employees.map((employee) => [employee.id, employee])),
    projectById: new Map(workspace.projects.map((project) => [project.id, project])),
    warehouseById: new Map(workspace.warehouses.map((warehouse) => [warehouse.id, warehouse])),
    activeManagerByWorker: new Map(
      workspace.managerAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.workerId, assignment]),
    ),
    activeProjectByEmployee: new Map(
      workspace.projectAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.employeeId, assignment]),
    ),
    activeWarehouseByEmployee: new Map(
      workspace.warehouseAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.employeeId, assignment]),
    ),
  }
}

export type HomeViewDerivedLookups = ReturnType<typeof buildHomeViewDerivedLookups>
