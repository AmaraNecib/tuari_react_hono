import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/features/shared/page-primitives"
import { RecordTabs } from "@/features/shared/record-page-frame"
import { EmployeeEarningsHistory } from "@/features/employees/employee-earnings-history"

import { SalaryPaymentsTable, type SalaryPaymentRow } from "./salary-payments-table"
import { SalariedWorkersTable, type SalariedWorkerRow } from "./salaried-workers-table"
import { patchSalariesSearch, type SalariesRouteSearch } from "./salaries-route-search"
import type { SalaryRoutePagination } from "./salary-route-pagination"

const DEFAULT_SEARCH: SalariesRouteSearch = { tab: "recent", page: 1, pageSize: 10 }

/** Salary tabs share route-backed pagination; each table keeps its own filters. */
export function SalariesSection({
  recentPayments,
  workers,
  employees,
  projects,
  onEditSalary,
  onAddPayment = () => {},
  routeSearch,
  onRouteSearchChange,
}: {
  recentPayments: SalaryPaymentRow[]
  workers: SalariedWorkerRow[]
  employees: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string }>
  onEditSalary: (employeeId: string) => void
  onAddPayment?: (employeeId: string, employeeName: string) => void
  routeSearch?: SalariesRouteSearch
  onRouteSearchChange?: (patch: Partial<Pick<SalariesRouteSearch, "tab" | "page" | "pageSize">>) => void
}) {
  const { t } = useTranslation()
  const [localSearch, setLocalSearch] = useState(DEFAULT_SEARCH)
  const search = routeSearch ?? localSearch
  const updateSearch = (patch: Partial<Pick<SalariesRouteSearch, "tab" | "page" | "pageSize">>) => {
    if (onRouteSearchChange) {
      onRouteSearchChange(patch)
    } else {
      setLocalSearch((previous) => patchSalariesSearch(previous, patch))
    }
  }
  const resetPageForFilter = () => {
    if (search.page !== 1) updateSearch({ page: 1 })
  }
  const routePagination: SalaryRoutePagination = {
    page: search.page,
    pageSize: search.pageSize,
    onPageChange: (page) => updateSearch({ page }),
    onPageSizeChange: (pageSize) => updateSearch({ page: 1, pageSize }),
  }
  const employeeNames = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  )
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  )

  return (
    <div className="space-y-6">
      <PageHeader title={t("sections.salaries.label")} />

      <RecordTabs
        activeTab={search.tab}
        tabs={[
          { id: "recent", label: t("salaries.recentTitle") },
          { id: "workers", label: t("salaries.workersTitle") },
          { id: "earnings", label: t("earnings.historyTitle") },
        ]}
        onChange={(tab) => updateSearch({ tab: tab as SalariesRouteSearch["tab"], page: 1 })}
      />

      <div hidden={search.tab !== "recent"}>
        <SalaryPaymentsTable
          payments={recentPayments}
          projects={projects}
          onAddPayment={onAddPayment}
          onEditSalary={onEditSalary}
          routePagination={search.tab === "recent" ? routePagination : undefined}
          onFilterChange={resetPageForFilter}
        />
      </div>

      <div hidden={search.tab !== "workers"}>
        <SalariedWorkersTable
          workers={workers}
          projects={projects}
          onAddPayment={onAddPayment}
          onEditSalary={onEditSalary}
          routePagination={search.tab === "workers" ? routePagination : undefined}
          onFilterChange={resetPageForFilter}
        />
      </div>

      {search.tab === "earnings" ? (
        <EmployeeEarningsHistory
          employeeNames={employeeNames}
          projectNames={projectNames}
          routePagination={routePagination}
        />
      ) : null}
    </div>
  )
}
