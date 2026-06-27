/**
 * Employee salary derivation for the home view.
 * Formats and displays employee salary information.
 */
import { getArabicRoleLabel } from "@/features/shared/status-meta"

import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import { formatName } from "./home-view-derived-formatters"
import type { HomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { buildEmployeeRows } from "./home-view-derived-employees"
import type { DemoWorkspace } from "./workspace-queries"

export function buildEmployeeSalaryCollections({
  copy,
  detailCopy,
  employeeRows,
  lookups,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  detailCopy: HomeViewDetailCopy
  employeeRows: ReturnType<typeof buildEmployeeRows>
  lookups: HomeViewDerivedLookups
  workspace: DemoWorkspace
}) {
  const salaryPaymentsByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      workspace.salaryPayments
        .filter((payment) => payment.employeeId === employee.id)
        .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate)),
    ]),
  )

  const recentSalaryPayments = workspace.salaryPayments
    .map((payment) => {
      const employee = lookups.employeeById.get(payment.employeeId)
      const role = employee ? lookups.roleById.get(employee.roleId) : null

      return {
        ...payment,
        employeeName: employee ? formatName(employee) : detailCopy.shared.activeWorkerMissing,
        employeePhone: employee?.phone ?? copy.shell.noManager,
        employeeRole: getArabicRoleLabel(role ?? null),
      }
    })
    .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate))

  const salariedEmployees = employeeRows
    .filter((employee) => employee.salaryAmountDzd !== null && employee.salaryPeriod)
    .map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      employeePhone: employee.phone,
      employeeRole: employee.role,
      salaryAmountDzd: employee.salaryAmountDzd,
      salaryPeriod: employee.salaryPeriod,
      lastPaymentDate: salaryPaymentsByEmployeeId[employee.id]?.[0]?.paymentDate ?? null,
    }))

  return {
    recentSalaryPayments,
    salariedEmployees,
    salaryPaymentsByEmployeeId,
  }
}
