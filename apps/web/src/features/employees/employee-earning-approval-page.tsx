import { Button } from "@/components/ui/button"
import { Surface } from "@/features/shared/page-primitives"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { EmployeeEarningApprovalForm, type SalaryProjectOption } from "./employee-earning-approval-form"
import type { EmployeeTableRow } from "./employee-table"
import { useTranslation } from "react-i18next"

export type EmployeeEarningReturnTo = "employee-finance" | "salaries"

export function EmployeeEarningApprovalPage({
  employee,
  projects,
  returnTo,
  onCancel,
  onComplete,
}: {
  employee: EmployeeTableRow | null
  projects: SalaryProjectOption[]
  returnTo: EmployeeEarningReturnTo
  onCancel: () => void
  onComplete: () => void
}) {
  const { t } = useTranslation()

  if (!employee || !employee.isWorker || employee.status !== "ACTIVE") {
    return (
      <RecordPageFrame title={t("earnings.title")}>
        <Surface className="space-y-4 p-6" role="status" variant="panel">
          <p className="text-sm leading-6 text-muted-foreground">{t("earnings.employeeUnavailable")}</p>
          <Button type="button" variant="outline" onClick={onCancel}>
            {returnTo === "salaries" ? t("earnings.backToSalaries") : t("detailPages.employee.back")}
          </Button>
        </Surface>
      </RecordPageFrame>
    )
  }

  return (
    <RecordPageFrame description={employee.name} title={t("earnings.title")}>
      <EmployeeEarningApprovalForm
        employeeId={employee.id}
        employeeName={null}
        projects={projects}
        salaryReference={employee.salaryReference}
        onCancel={onCancel}
        onComplete={onComplete}
      />
    </RecordPageFrame>
  )
}
