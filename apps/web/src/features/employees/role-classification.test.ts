import { describe, expect, it } from "vitest"

import {
  classifyWorkforceRole,
  isProjectManagerRoleKey,
  isWarehouseManagerRoleKey,
  isWorkerRoleKey,
} from "./role-classification"

describe("workforce role classification (issue #20)", () => {
  it("classifies worker as the assignable field worker only", () => {
    expect(classifyWorkforceRole("worker")).toEqual({
      isWorker: true,
      isProjectManager: false,
      isWarehouseManager: false,
    })
  })

  it("classifies project_manager as a project manager only", () => {
    expect(classifyWorkforceRole("project_manager")).toEqual({
      isWorker: false,
      isProjectManager: true,
      isWarehouseManager: false,
    })
    expect(isProjectManagerRoleKey("project_manager")).toBe(true)
  })

  it("classifies warehouse_manager as a warehouse manager only", () => {
    expect(classifyWorkforceRole("warehouse_manager")).toEqual({
      isWorker: false,
      isProjectManager: false,
      isWarehouseManager: true,
    })
    expect(isWarehouseManagerRoleKey("warehouse_manager")).toBe(true)
  })

  it("does not classify admin as a worker or manager (it is the owner)", () => {
    expect(classifyWorkforceRole("admin")).toEqual({
      isWorker: false,
      isProjectManager: false,
      isWarehouseManager: false,
    })
  })

  it("rejects unknown/empty keys from every workforce role", () => {
    for (const key of ["manager", "viewer", "", null, undefined]) {
      expect(isWorkerRoleKey(key)).toBe(false)
      expect(isProjectManagerRoleKey(key)).toBe(false)
      expect(isWarehouseManagerRoleKey(key)).toBe(false)
    }
  })
})
