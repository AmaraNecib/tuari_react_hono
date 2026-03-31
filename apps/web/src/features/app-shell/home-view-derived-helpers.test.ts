import { describe, expect, it } from "vitest"

import { deriveEmployeeDeleteState, deriveEmployeeLeaveState } from "./home-view-derived-employees"
import { deriveProjectArchiveState } from "./home-view-derived-projects"
import { deriveWarehouseArchiveState } from "./home-view-derived-warehouses"

const t = (key: string) => key

describe("home view derived helpers", () => {
  it("keeps employee delete reason priority unchanged", () => {
    expect(
      deriveEmployeeDeleteState(
        {
          hasManagedProjectHistory: true,
          hasManagedWarehouseHistory: false,
          hasManagerHistory: true,
          hasProjectHistory: true,
          hasSalaryPayments: true,
          hasWarehouseHistory: false,
          managesAnyProject: true,
          managesAnyWarehouse: false,
        },
        t,
      ),
    ).toEqual({
      canDelete: false,
      deleteDisabledReason: "detailPages.employee.deleteReasonManagementHistory",
    })
  })

  it("keeps employee leave rules unchanged for linked project managers", () => {
    expect(
      deriveEmployeeLeaveState(
        {
          employeeStatus: "ACTIVE",
          hasActiveProjectManagerProject: false,
          hasActiveProjectManagerReports: true,
          hasActiveWarehouseManagerWarehouse: false,
          hasManagerAssignment: false,
          hasProjectAssignment: false,
          hasWarehouseAssignment: false,
          roleKey: "project_manager",
        },
        t,
      ),
    ).toEqual({
      canLeave: false,
      leaveDisabledReason: "detailPages.employee.leaveReasonProjectManagerLinked",
    })
  })

  it("derives project archive state from active worker count", () => {
    expect(deriveProjectArchiveState(0, t)).toEqual({
      canArchive: true,
      archiveDisabledReason: null,
    })

    expect(deriveProjectArchiveState(2, t)).toEqual({
      canArchive: false,
      archiveDisabledReason: "detailPages.project.archiveReasonWorkers",
    })
  })

  it("derives warehouse archive reason from manager and worker state", () => {
    expect(
      deriveWarehouseArchiveState({
        hasActiveManagerRelation: true,
        hasActiveWarehouseWorkers: true,
        t,
      }),
    ).toEqual({
      canArchive: false,
      archiveDisabledReason: "detailPages.warehouse.archiveReasonManagerAndWorkers",
    })
  })
})
