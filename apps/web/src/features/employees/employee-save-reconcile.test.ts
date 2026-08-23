// Pure rollback helper for the multi-mutation employee save (issue #35).

import { describe, expect, it } from "vitest"

import {
  computeSaveFailureRollback,
  placementStateFromEmployee,
  type EmployeeSaveFailureContext,
  type PlacementState,
} from "./employee-save-reconcile"

const projectPlacement: PlacementState = {
  workerManagerId: "mgr-1",
  workerProjectId: "proj-1",
  workerWarehouseId: "",
  workplaceType: "PROJECT",
}

const otherPlacement: PlacementState = {
  workerManagerId: "mgr-2",
  workerProjectId: "proj-2",
  workerWarehouseId: "",
  workplaceType: "PROJECT",
}

describe("placementStateFromEmployee", () => {
  it("derives a project placement from the employee row", () => {
    expect(
      placementStateFromEmployee({
        currentManagerId: "mgr-1",
        currentProjectId: "proj-1",
        currentWarehouseId: null,
      }),
    ).toEqual(projectPlacement)
  })

  it("derives a warehouse placement from the employee row", () => {
    expect(
      placementStateFromEmployee({
        currentManagerId: null,
        currentProjectId: null,
        currentWarehouseId: "wh-1",
      }),
    ).toEqual({
      workerManagerId: "",
      workerProjectId: "",
      workerWarehouseId: "wh-1",
      workplaceType: "WAREHOUSE",
    })
  })

  it("derives an empty placement for a worker without a workplace", () => {
    expect(
      placementStateFromEmployee({
        currentManagerId: null,
        currentProjectId: null,
        currentWarehouseId: null,
      }),
    ).toEqual({
      workerManagerId: "",
      workerProjectId: "",
      workerWarehouseId: "",
      workplaceType: "NONE",
    })
  })
})

describe("computeSaveFailureRollback", () => {
  const baseContext: EmployeeSaveFailureContext = {
    plan: {
      workplace: {
        managerId: "mgr-2",
        nextType: "PROJECT",
        projectId: "proj-2",
        warehouseId: null,
      },
      managedProjects: { nextIds: ["proj-1", "proj-2"] },
      managedWarehouses: null,
    },
    succeededSteps: [],
    preSavePlacement: projectPlacement,
    preSaveManagedProjectIds: ["proj-1"],
    preSaveManagedWarehouseIds: ["wh-1"],
  }

  it("keeps submitted placement and managed scope for steps that succeeded", () => {
    const rollback = computeSaveFailureRollback({
      ...baseContext,
      succeededSteps: ["workplace", "managedProjects"],
    })

    expect(rollback.placement).toEqual(otherPlacement)
    expect(rollback.managedProjectIds).toEqual(["proj-1", "proj-2"])
    expect(rollback.managedWarehouseIds).toEqual(["wh-1"])
  })

  it("restores the pre-save placement when the workplace step failed", () => {
    const rollback = computeSaveFailureRollback({
      ...baseContext,
      succeededSteps: ["managedProjects"],
    })

    expect(rollback.placement).toEqual(projectPlacement)
    expect(rollback.managedProjectIds).toEqual(["proj-1", "proj-2"])
  })

  it("restores the pre-save managed scope for a step that never ran", () => {
    const rollback = computeSaveFailureRollback({
      ...baseContext,
      succeededSteps: ["workplace"],
    })

    expect(rollback.placement).toEqual(otherPlacement)
    expect(rollback.managedProjectIds).toEqual(["proj-1"])
  })

  it("keeps submitted warehouse scope when that step succeeded (the final dispatch step)", () => {
    const rollback = computeSaveFailureRollback({
      ...baseContext,
      plan: {
        workplace: null,
        managedProjects: null,
        managedWarehouses: { nextIds: ["wh-1", "wh-2"] },
      },
      succeededSteps: ["managedWarehouses"],
    })

    expect(rollback.placement).toEqual(projectPlacement)
    expect(rollback.managedProjectIds).toEqual(["proj-1"])
    expect(rollback.managedWarehouseIds).toEqual(["wh-1", "wh-2"])
  })

  it("falls back to pre-save truth when every step failed", () => {
    const rollback = computeSaveFailureRollback(baseContext)

    expect(rollback.placement).toEqual(projectPlacement)
    expect(rollback.managedProjectIds).toEqual(["proj-1"])
    expect(rollback.managedWarehouseIds).toEqual(["wh-1"])
  })
})
