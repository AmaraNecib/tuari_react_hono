import { useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/features/shared/page-primitives"
import { RecordTabs } from "@/features/shared/record-page-frame"
import { AddSalaryPaymentDialog } from "@/features/employees/add-salary-payment-dialog"

import { SalaryPaymentsTable, type SalaryPaymentRow } from "./salary-payments-table"
import { SalariedWorkersTable, type SalariedWorkerRow } from "./salaried-workers-table"

/**
 * The salaries screen: a tab shell that chooses between the payment-history
 * table and the salaried-workers table, and owns the one shared payment dialog.
 * Each table owns its own filters, query, pagination and empty state.
 */
export function SalariesSection({
  recentPayments,
  workers,
  projects,
  onEditSalary,
}: {
  recentPayments: SalaryPaymentRow[]
  workers: SalariedWorkerRow[]
  projects: Array<{ id: string; name: string }>
  onEditSalary: (employeeId: string) => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState("recent")
  // Only the identity is snapshotted when the dialog opens; the wage, period,
  // and assignment windows are read from the live query data below so a
  // workspace refresh cannot leave a stale proposal or day default behind.
  const [paymentTarget, setPaymentTarget] = useState<{ id: string; name: string } | null>(null)

  const paymentWorker = paymentTarget
    ? workers.find((worker) => worker.employeeId === paymentTarget.id) ?? null
    : null

  const openPaymentForm = (employeeId: string, employeeName: string) => {
    setPaymentTarget({ id: employeeId, name: employeeName })
  }

  return (
    <div className="space-y-6">
      <AddSalaryPaymentDialog
        employeeId={paymentTarget?.id ?? null}
        employeeName={paymentWorker?.employeeName ?? paymentTarget?.name}
        salaryAmountDzd={paymentWorker?.salaryAmountDzd ?? null}
        salaryPeriod={paymentWorker?.salaryPeriod ?? null}
        projectAssignments={paymentWorker?.projectAssignments ?? []}
        projects={projects}
        open={paymentTarget !== null}
        onOpenChange={(open) => { if (!open) setPaymentTarget(null) }}
      />

      <PageHeader title={t("sections.salaries.label")} />

      <RecordTabs
        activeTab={activeTab}
        tabs={[
          { id: "recent", label: t("salaries.recentTitle") },
          { id: "workers", label: t("salaries.workersTitle") },
        ]}
        onChange={setActiveTab}
      />

      {/* Both tables stay mounted and the inactive one is hidden, so each tab
          keeps its own query, filters and page across a tab switch — the same
          state the pre-extraction shell held for both pipelines. Hidden content
          leaves the accessibility tree, so role/label queries still see one
          table at a time. */}
      <div hidden={activeTab !== "recent"}>
        <SalaryPaymentsTable
          payments={recentPayments}
          projects={projects}
          onAddPayment={openPaymentForm}
          onEditSalary={onEditSalary}
        />
      </div>

      <div hidden={activeTab !== "workers"}>
        <SalariedWorkersTable
          workers={workers}
          projects={projects}
          onAddPayment={openPaymentForm}
          onEditSalary={onEditSalary}
        />
      </div>
    </div>
  )
}
