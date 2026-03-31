import type { HomeViewPageContentProps } from "./home-view-page-content-shared"
import {
  includeCurrentProjectManagerOption,
  includeCurrentWarehouseManagerOption,
} from "./home-view-page-content-shared"

export function buildEmployeeEditManagerOptions(
  derived: HomeViewPageContentProps["derived"],
  selectedEmployee: HomeViewPageContentProps["selectedEmployee"],
) {
  return selectedEmployee
    ? includeCurrentProjectManagerOption(
        derived.managerOptions,
        {
          id: selectedEmployee.currentManagerId,
          label: selectedEmployee.managerName,
        },
        {
          id: selectedEmployee.currentProjectId,
          label: selectedEmployee.currentWorkplace,
        },
      )
    : derived.managerOptions
}

export function buildProjectEditManagerOptions(
  derived: HomeViewPageContentProps["derived"],
  selectedProject: HomeViewPageContentProps["selectedProject"],
) {
  return selectedProject
    ? includeCurrentProjectManagerOption(derived.projectManagerOptions, {
        id: selectedProject.managerId,
        label: selectedProject.managerName,
      })
    : derived.projectManagerOptions
}

export function buildWarehouseEditManagerOptions(
  derived: HomeViewPageContentProps["derived"],
  selectedWarehouse: HomeViewPageContentProps["selectedWarehouse"],
) {
  return selectedWarehouse
    ? includeCurrentWarehouseManagerOption(derived.warehouseManagerOptions, {
        id: selectedWarehouse.managerId,
        label: selectedWarehouse.managerName,
      })
    : derived.warehouseManagerOptions
}
