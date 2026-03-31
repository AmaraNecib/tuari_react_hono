import { describe, expect, it } from "vitest"

import {
  buildEmployeeEditManagerOptions,
  buildProjectEditManagerOptions,
  buildWarehouseEditManagerOptions,
} from "./home-view-page-content-view-model"
import type { HomeViewPageContentProps } from "./home-view-page-content-shared"

function createDerivedStub(): Pick<
  HomeViewPageContentProps["derived"],
  "managerOptions" | "projectManagerOptions" | "warehouseManagerOptions"
> {
  return {
    managerOptions: [
      {
        id: "manager-active",
        label: "مدير نشط",
        projectOptions: [{ id: "project-active", label: "مشروع نشط" }],
      },
    ],
    projectManagerOptions: [
      {
        id: "manager-active",
        label: "مدير نشط",
        projectOptions: [{ id: "project-active", label: "مشروع نشط" }],
      },
    ],
    warehouseManagerOptions: [{ id: "warehouse-manager-active", label: "مسؤول مخزن نشط" }],
  }
}

describe("home view page content view model", () => {
  it("preserves the current inactive worker manager with the assigned project option", () => {
    const derived = createDerivedStub()

    const result = buildEmployeeEditManagerOptions(derived as HomeViewPageContentProps["derived"], {
      currentManagerId: "manager-inactive",
      currentProjectId: "project-current",
      currentWorkplace: "مشروع حالي محفوظ",
      managerName: "مدير سابق",
    } as HomeViewPageContentProps["selectedEmployee"])

    expect(result[0]).toEqual({
      id: "manager-inactive",
      label: "مدير سابق",
      projectOptions: [{ id: "project-current", label: "مشروع حالي محفوظ" }],
    })
  })

  it("preserves the current project manager when no longer in active options", () => {
    const derived = createDerivedStub()

    const result = buildProjectEditManagerOptions(derived as HomeViewPageContentProps["derived"], {
      managerId: "manager-inactive",
      managerName: "مدير مشروع سابق",
    } as HomeViewPageContentProps["selectedProject"])

    expect(result[0]).toEqual({
      id: "manager-inactive",
      label: "مدير مشروع سابق",
      projectOptions: [],
    })
  })

  it("preserves the current warehouse manager when no longer in active options", () => {
    const derived = createDerivedStub()

    const result = buildWarehouseEditManagerOptions(derived as HomeViewPageContentProps["derived"], {
      managerId: "warehouse-manager-inactive",
      managerName: "مسؤول مخزن سابق",
    } as HomeViewPageContentProps["selectedWarehouse"])

    expect(result[0]).toEqual({
      id: "warehouse-manager-inactive",
      label: "مسؤول مخزن سابق",
    })
  })
})
