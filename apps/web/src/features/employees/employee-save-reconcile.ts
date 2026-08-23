import type { EmployeeTableRow } from "./employee-table"

/**
 * Employee edit save atomicity — rollback helper (issue #35).
 *
 * `handleSaveAll` dispatches up to four mutation RPCs sequentially; when a
 * later one fails, earlier ones already persisted. Each mutation is a
 * full-state write, so the page state that matches what actually persisted is:
 * - a step that succeeded -> its submitted values ARE the server truth;
 * - a step that failed or never ran -> the write never happened, so the
 *   pre-save value is the truth.
 *
 * This module computes that "persisted truth" for the placement / managed
 * scope controls. Profile fields are reconciled by re-fetching the employee
 * (`employeesGet`); placement fields are NOT in `employeeSchema`, so they are
 * derived here from the per-step truth instead.
 */

export type WorkplaceSubmission = {
  managerId: string | null
  nextType: "NONE" | "PROJECT" | "WAREHOUSE"
  projectId: string | null
  warehouseId: string | null
}

export type ManagedScopeSubmission = {
  nextIds: string[]
}

export type EmployeeSavePlan = {
  workplace: WorkplaceSubmission | null
  managedProjects: ManagedScopeSubmission | null
  managedWarehouses: ManagedScopeSubmission | null
}

export type PlacementState = {
  workerManagerId: string
  workerProjectId: string
  workerWarehouseId: string
  workplaceType: "NONE" | "PROJECT" | "WAREHOUSE"
}

export type EmployeeSaveFailureContext = {
  plan: EmployeeSavePlan
  /** Steps whose `await` settled successfully, in dispatch order. */
  succeededSteps: Array<"workplace" | "managedProjects" | "managedWarehouses">
  preSavePlacement: PlacementState
  preSaveManagedProjectIds: string[]
  preSaveManagedWarehouseIds: string[]
}

export type EmployeeSaveRollback = {
  placement: PlacementState
  managedProjectIds: string[]
  managedWarehouseIds: string[]
}

/** Derive the placement controls from an employee row (mirrors page init/resync). */
export function placementStateFromEmployee(
  employee: Pick<EmployeeTableRow, "currentManagerId" | "currentProjectId" | "currentWarehouseId">,
): PlacementState {
  return {
    workerManagerId: employee.currentManagerId ?? "",
    workerProjectId: employee.currentProjectId ?? "",
    workerWarehouseId: employee.currentWarehouseId ?? "",
    workplaceType: employee.currentProjectId ? "PROJECT" : employee.currentWarehouseId ? "WAREHOUSE" : "NONE",
  }
}

function placementStateFromSubmission(submission: WorkplaceSubmission): PlacementState {
  return {
    workerManagerId: submission.managerId ?? "",
    workerProjectId: submission.projectId ?? "",
    workerWarehouseId: submission.warehouseId ?? "",
    workplaceType: submission.nextType,
  }
}

/**
 * Page state that matches what actually persisted after a partial save failure.
 * A step that succeeded keeps its submitted values (they ARE the DB truth); a
 * step that failed or never started falls back to the pre-save values.
 */
export function computeSaveFailureRollback(input: EmployeeSaveFailureContext): EmployeeSaveRollback {
  const workplaceStep = input.plan.workplace
  const managedProjectsStep = input.plan.managedProjects
  const managedWarehousesStep = input.plan.managedWarehouses

  return {
    placement:
      workplaceStep && input.succeededSteps.includes("workplace")
        ? placementStateFromSubmission(workplaceStep)
        : input.preSavePlacement,
    managedProjectIds:
      managedProjectsStep && input.succeededSteps.includes("managedProjects")
        ? managedProjectsStep.nextIds
        : input.preSaveManagedProjectIds,
    managedWarehouseIds:
      managedWarehousesStep && input.succeededSteps.includes("managedWarehouses")
        ? managedWarehousesStep.nextIds
        : input.preSaveManagedWarehouseIds,
  }
}
