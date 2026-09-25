/**
 * Employee edit save payload shapes.
 *
 * Since issue #49 the save is one atomic RPC and a rejected batch means nothing
 * persisted (verified by API transaction tests), so the client no longer keeps
 * per-step rollback machinery. These types describe what the page intends to
 * submit; fields left out of the plan are omitted from the RPC entirely so a
 * stale page cannot revert newer concurrent relationship updates.
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
