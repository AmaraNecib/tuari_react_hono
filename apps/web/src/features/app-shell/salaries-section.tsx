import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/features/shared/page-primitives"
import { NativeSelect } from "@/components/ui/form-controls"
import { EmployeePayrollPanel } from "@/features/employees/employee-payroll-panel"
import { RecordTabs } from "@/features/shared/record-page-frame"
import { EmployeeEarningsHistory } from "@/features/employees/employee-earnings-history"

import { SalariedWorkersTable, type SalariedWorkerRow } from "./salaried-workers-table"
import { patchSalariesSearch, type SalariesRouteSearch } from "./salaries-route-search"
import type { SalaryRoutePagination } from "./salary-route-pagination"

const DEFAULT_SEARCH: SalariesRouteSearch = { tab: "recent", page: 1, pageSize: 10 }

/** Salary tabs share route-backed pagination; each table keeps its own filters. */
export function SalariesSection({
  workers,
  employees,
  projects,
  onEditSalary,
  onAddPayment = () => {},
  routeSearch,
  onRouteSearchChange,
}: {
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
  const [payrollEmployeeId, setPayrollEmployeeId] = useState(() => workers[0]?.employeeId ?? "")
  const rawSearch = routeSearch ?? localSearch
  // Old recent-payment URLs now open the actual approved-earnings lifecycle.
  const search = { ...rawSearch, tab: rawSearch.tab === "recent" ? "earnings" : rawSearch.tab }
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
          { id: "workers", label: t("salaries.workersTitle") },
          { id: "earnings", label: t("earnings.historyTitle") },
        ]}
        onChange={(tab) => updateSearch({ tab: tab as SalariesRouteSearch["tab"], page: 1 })}
      />

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
        <div className="space-y-6">
          <EmployeeEarningsHistory
            employeeNames={employeeNames}
            projectNames={projectNames}
            routePagination={routePagination}
          />
          {workers.length ? (
            <section className="space-y-4 border-t border-border/60 pt-5" aria-labelledby="salary-payroll-heading">
              <h2 id="salary-payroll-heading" className="text-lg font-semibold">{t("payroll.salarySurfaceTitle")}</h2>
              <label className="block max-w-md space-y-1 text-sm">
                <span>{t("payroll.employee")}</span>
                <NativeSelect aria-label={t("payroll.employee")} value={workers.some(worker => worker.employeeId === payrollEmployeeId) ? payrollEmployeeId : workers[0]!.employeeId} onChange={event => setPayrollEmployeeId(event.target.value)}>
                  {workers.map(worker => <option key={worker.employeeId} value={worker.employeeId}>{worker.employeeName}</option>)}
                </NativeSelect>
              </label>
              <EmployeePayrollPanel employeeId={workers.some(worker => worker.employeeId === payrollEmployeeId) ? payrollEmployeeId : workers[0]!.employeeId} />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
