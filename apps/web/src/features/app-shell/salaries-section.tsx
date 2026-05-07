import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/features/shared/page-primitives"
import { RecordTabs } from "@/features/shared/record-page-frame"
import { AddSalaryPaymentDialog } from "@/features/employees/add-salary-payment-dialog"

import {
  AppShellActionGroup,
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "./app-shell-table-primitives"

function getSalaryPeriodLabelKey(value: "DAILY" | "WEEKLY" | "MONTHLY" | null) {
  if (value === "DAILY") return "detailPages.salary.daily"
  if (value === "WEEKLY") return "detailPages.salary.weekly"
  if (value === "MONTHLY") return "detailPages.salary.monthly"
  return "detailPages.salary.notSpecified"
}

function MoneyCell({ value, currencyLabel }: { value: number; currencyLabel: string }) {
  return (
    <span className="font-mono tabular-nums text-ink" dir="ltr">
      {currencyLabel}{" "}
      {new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, useGrouping: true }).format(value)}
    </span>
  )
}

export function SalariesSection({
  recentPayments,
  workers,
  onEditSalary,
}: {
  recentPayments: Array<{
    id: string
    employeeId: string
    employeeName: string
    employeePhone: string
    employeeRole: string
    paymentDate: string
    expectedAmountDzd: number
    actualAmountDzd: number
    note: string | null
  }>
  workers: Array<{
    employeeId: string
    employeeName: string
    employeePhone: string
    employeeRole: string
    salaryAmountDzd: number | null
    salaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null
    lastPaymentDate: string | null
  }>
  onEditSalary: (employeeId: string) => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState("recent")
  const [paymentTarget, setPaymentTarget] = useState<{ id: string; name: string } | null>(null)
  const currencyLabel = t("detailPages.salary.currency")
  const sortedWorkers = useMemo(
    () => [...workers].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ar")),
    [workers],
  )

  return (
    <div className="space-y-6">
      <AddSalaryPaymentDialog
        employeeId={paymentTarget?.id ?? null}
        employeeName={paymentTarget?.name}
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

      {activeTab === "recent" ? (
        <AppShellTableFrame>
          <table className="min-w-full">
            <AppShellTableHead>
              <tr>
                <AppShellTableHeaderCell>{t("columns.name")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("salaries.paymentDate")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("salaries.expectedAmount")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("salaries.actualAmount")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("salaries.notes")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell className="text-end">{t("common.actions")}</AppShellTableHeaderCell>
              </tr>
            </AppShellTableHead>
            <tbody>
              {recentPayments.length > 0 ? (
                recentPayments.map((payment) => (
                  <AppShellTableRow key={payment.id}>
                    <td className="px-4 py-3 text-start">
                      <p className="text-[13px] font-medium text-ink" dir="auto">{payment.employeeName}</p>
                      <p className="text-[11px] text-ink-3" dir="auto">{payment.employeeRole}</p>
                    </td>
                    <td className="px-4 py-3 text-start text-[13px] text-ink-2">
                      {new Intl.DateTimeFormat("ar-DZ").format(new Date(payment.paymentDate))}
                    </td>
                    <td className="px-4 py-3 text-start">
                      <MoneyCell value={payment.expectedAmountDzd} currencyLabel={currencyLabel} />
                    </td>
                    <td className="px-4 py-3 text-start">
                      <MoneyCell value={payment.actualAmountDzd} currencyLabel={currencyLabel} />
                    </td>
                    <td className="px-4 py-3 text-start text-[12.5px] text-ink-3">
                      {payment.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <AppShellActionGroup className="justify-end">
                        <Button size="xs" onClick={() => setPaymentTarget({ id: payment.employeeId, name: payment.employeeName })}>
                          {t("salaries.addPayment")}
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => onEditSalary(payment.employeeId)}>
                          {t("salaries.editSalary")}
                        </Button>
                      </AppShellActionGroup>
                    </td>
                  </AppShellTableRow>
                ))
              ) : (
                <AppShellEmptyStateRow colSpan={6}>{t("salaries.recentEmpty")}</AppShellEmptyStateRow>
              )}
            </tbody>
          </table>
        </AppShellTableFrame>
      ) : null}

      {activeTab === "workers" ? (
        <AppShellTableFrame>
          <table className="min-w-full">
            <AppShellTableHead>
              <tr>
                <AppShellTableHeaderCell>{t("columns.name")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("salaries.currentSalary")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("salaries.lastPaymentDate")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell className="text-end">{t("common.actions")}</AppShellTableHeaderCell>
              </tr>
            </AppShellTableHead>
            <tbody>
              {sortedWorkers.length > 0 ? (
                sortedWorkers.map((worker) => (
                  <AppShellTableRow key={worker.employeeId}>
                    <td className="px-4 py-3 text-start">
                      <p className="text-[13px] font-medium text-ink" dir="auto">{worker.employeeName}</p>
                      <p className="text-[11px] text-ink-3" dir="auto">{worker.employeeRole}</p>
                    </td>
                    <td className="px-4 py-3 text-start">
                      {worker.salaryAmountDzd !== null ? (
                        <span className="inline-flex items-baseline gap-1.5">
                          <MoneyCell value={worker.salaryAmountDzd} currencyLabel={currencyLabel} />
                          <span className="text-[11px] text-ink-3">/ {t(getSalaryPeriodLabelKey(worker.salaryPeriod))}</span>
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-ink-4">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-start text-[13px] text-ink-3">
                      {worker.lastPaymentDate
                        ? new Intl.DateTimeFormat("ar-DZ").format(new Date(worker.lastPaymentDate))
                        : <span className="text-ink-4">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <AppShellActionGroup className="justify-end">
                        <Button size="xs" onClick={() => setPaymentTarget({ id: worker.employeeId, name: worker.employeeName })}>
                          {t("salaries.addPayment")}
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => onEditSalary(worker.employeeId)}>
                          {t("salaries.editSalary")}
                        </Button>
                      </AppShellActionGroup>
                    </td>
                  </AppShellTableRow>
                ))
              ) : (
                <AppShellEmptyStateRow colSpan={4}>{t("salaries.workersEmpty")}</AppShellEmptyStateRow>
              )}
            </tbody>
          </table>
        </AppShellTableFrame>
      ) : null}
    </div>
  )
}
