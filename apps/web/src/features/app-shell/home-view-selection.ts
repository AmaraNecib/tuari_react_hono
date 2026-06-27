/**
 * Selection logic for the home view.
 * Handles item selection and navigation state.
 */
import type { TFunction } from "i18next"

import { buildHomeViewBreadcrumbItems } from "./home-view-breadcrumbs"
import type { HomeViewCopy } from "./home-view-copy"
import type { HomeViewDerived } from "./home-view-derived"
import type { HomeViewPage } from "./home-view-types"

export function buildHomeViewSelection({
  counterpartyId,
  copy,
  derived,
  employeeId,
  invoiceId,
  page,
  projectId,
  t,
  warehouseId,
}: {
  counterpartyId?: string
  copy: HomeViewCopy
  derived: HomeViewDerived | null
  employeeId?: string
  invoiceId?: string
  page: HomeViewPage
  projectId?: string
  t: TFunction
  warehouseId?: string
}) {
  void invoiceId

  const selectedEmployee = employeeId
    ? derived?.employeeRows.find((employee) => employee.id === employeeId) ?? null
    : null
  const selectedProject = projectId
    ? derived?.projects.find((project) => project.id === projectId) ?? null
    : null
  const selectedCounterparty = counterpartyId
    ? derived?.externalCounterparties.find((counterparty) => counterparty.id === counterpartyId) ?? null
    : null
  const selectedWarehouse = warehouseId
    ? derived?.warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null
    : null

  return {
    breadcrumbItems: derived
      ? buildHomeViewBreadcrumbItems({
          copy,
          page,
          selectedCounterparty,
          selectedEmployee,
          selectedProject,
          selectedWarehouse,
          t,
        })
      : [],
    selectedEmployee,
    selectedCounterparty,
    selectedProject,
    selectedWarehouse,
  }
}
