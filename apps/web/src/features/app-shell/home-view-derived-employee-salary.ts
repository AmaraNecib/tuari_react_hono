/**
 * Employee salary derivation for the home view.
 * Formats and displays employee salary information.
 */
import { getArabicRoleLabel } from "@/features/shared/status-meta"

import type { HomeViewDetailCopy } from "./home-view-copy"
import { formatName } from "./home-view-derived-formatters"
import type { HomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { buildEmployeeRows } from "./home-view-derived-employees"
import type { DemoWorkspace } from "./workspace-queries"

/**
 * buildEmployeeSalaryCollections({ component.
 */
export function buildEmployeeSalaryCollections({
  detailCopy,
  employeeRows,
  lookups,
  workspace,
}: {
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
        employeePhone: employee?.phone ?? "—",
        employeeRole: getArabicRoleLabel(role ?? null),
      }
    })
    .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate))

  // Group the assignments by employee in one pass. The previous shape scanned
  // every assignment once per employee, so a workspace refresh re-did the whole
  // scan as history grew.
  const projectAssignmentsByEmployeeId: Record<string, Array<{ projectId: string; startDate: string; endDate: string | null }>> = {}
  for (const employee of workspace.employees) {
    projectAssignmentsByEmployeeId[employee.id] = []
  }
  for (const assignment of workspace.projectAssignments) {
    const windows = projectAssignmentsByEmployeeId[assignment.employeeId]
    if (!windows) {
      continue
    }
    // An archived assignment is history, not a wage-period window: an archived
    // row with no end date would otherwise cover the whole payment period and
    // suggest a month of days to a project the worker no longer works on.
    if (assignment.status === "ARCHIVED") {
      continue
    }
    windows.push({
      projectId: assignment.projectId,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
    })
  }

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
      // Assignment windows feed the payment form's derived per-project default.
      projectAssignments: projectAssignmentsByEmployeeId[employee.id] ?? [],
    }))

  const salaryProjects = workspace.projects
    .map((project) => ({ id: project.id, name: project.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"))

  return {
    recentSalaryPayments,
    salariedEmployees,
    projectAssignmentsByEmployeeId,
    salaryPaymentsByEmployeeId,
    salaryProjects,
  }
}
