import type { TFunction } from "i18next"

import { workspaceRoutes, type WorkspaceRouteTarget } from "@/router/navigation"

import type { HomeViewCopy } from "./home-view-copy"
import type { HomeViewPage } from "./home-view-types"

export function buildHomeViewBreadcrumbItems({
  copy,
  page,
  selectedCounterparty,
  selectedEmployee,
  selectedProject,
  selectedWarehouse,
  t,
}: {
  copy: HomeViewCopy
  page: HomeViewPage
  selectedCounterparty: { id: string; fullName: string } | null
  selectedEmployee: { id: string; name: string } | null
  selectedProject: { id: string; name: string } | null
  selectedWarehouse: { id: string; name: string } | null
  t: TFunction
}) {
  return [
    { label: copy.sections.dashboard.label, to: workspaceRoutes.dashboard() },
    ...(page === "employees" || page === "employees-create" || page === "employee-details" || page === "employee-edit"
      ? [{ label: copy.sections.employees.label, to: workspaceRoutes.employees() }]
      : page === "debts" || page === "debt-create"
        ? [{ label: copy.sections.debts.label, to: workspaceRoutes.debts() }]
      : page === "externals" || page === "external-create" || page === "external-details"
        ? [{ label: copy.sections.externals.label, to: workspaceRoutes.externals() }]
      : page === "projects" || page === "project-create" || page === "project-details" || page === "project-edit"
        ? [{ label: copy.sections.projects.label, to: workspaceRoutes.projects() }]
        : page === "salaries"
          ? [{ label: copy.sections.salaries.label, to: workspaceRoutes.salaries() }]
          : page === "warehouses" || page === "warehouse-create" || page === "warehouse-details" || page === "warehouse-edit"
            ? [{ label: copy.sections.warehouses.label, to: workspaceRoutes.warehouses() }]
            : page === "transactions"
              ? [{ label: copy.sections.transactions.label, to: workspaceRoutes.transactions() }]
              : page === "roles"
                ? [{ label: copy.sections.roles.label, to: workspaceRoutes.roles() }]
              : page === "inventory"
                ? [{ label: "دليل العناصر", to: workspaceRoutes.inventory() }]
                : page === "invoices" || page === "invoice-create" || page === "invoice-details"
                  ? [{ label: "الفواتير", to: workspaceRoutes.invoices() }]
                  : page === "settings"
                   ? [{ label: copy.sections.settings.label, to: workspaceRoutes.settings() }]
                   : []),
    ...(page === "employees-create"
      ? [{ label: t("detailPages.employee.createBreadcrumb") }]
      : page === "employee-details" && selectedEmployee
        ? [{ label: selectedEmployee.name }]
        : page === "employee-edit" && selectedEmployee
          ? [{ label: selectedEmployee.name, to: workspaceRoutes.employeeDetails(selectedEmployee.id) }, { label: copy.common.edit }]
          : page === "externals"
            ? [{ label: copy.sections.externals.label }]
            : page === "external-create"
              ? [
                  { label: copy.sections.externals.label, to: workspaceRoutes.externals() },
                  { label: "إضافة جهة خارجية" },
                ]
              : page === "external-details" && selectedCounterparty
                ? [
                    { label: copy.sections.externals.label, to: workspaceRoutes.externals() },
                    { label: selectedCounterparty.fullName },
                  ]
          : page === "project-create"
            ? [{ label: t("detailPages.project.createBreadcrumb") }]
            : page === "project-details" && selectedProject
             ? [{ label: selectedProject.name }]
             : page === "project-edit" && selectedProject
               ? [{ label: selectedProject.name, to: workspaceRoutes.projectDetails(selectedProject.id) }, { label: t("detailPages.project.editBreadcrumb") }]
                : page === "warehouse-create"
                  ? [{ label: t("detailPages.warehouse.createBreadcrumb") }]
                  : page === "warehouse-details" && selectedWarehouse
                  ? [{ label: selectedWarehouse.name }]
                 : page === "warehouse-edit" && selectedWarehouse
                   ? [{ label: selectedWarehouse.name, to: workspaceRoutes.warehouseDetails(selectedWarehouse.id) }, { label: t("detailPages.warehouse.editBreadcrumb") }]
                   : page === "inventory"
                     ? [{ label: "دليل العناصر" }]
                     : page === "invoices"
                       ? [{ label: "كل الفواتير" }]
                       : page === "invoice-create"
                         ? [{ label: "إضافة فاتورة" }]
                         : page === "invoice-details"
                           ? [{ label: "تفاصيل الفاتورة" }]
                   : []),
  ]
}

export type HomeViewBreadcrumbItem = {
  label: string
  to?: WorkspaceRouteTarget
}
