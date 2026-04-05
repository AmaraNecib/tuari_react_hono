import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { RecordTabs, RecordPageFrame } from "@/features/shared/record-page-frame"

import {
  AppShellActionGroup,
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
    AppShellTableHeaderCell,
    AppShellTableRow,
  } from "./app-shell-table-primitives"

function getSalaryPeriodLabelKey(value: "DAILY" | "WEEKLY" | "MONTHLY" | null) {
  if (value === "DAILY") {
    return "detailPages.salary.daily"
  }

  if (value === "WEEKLY") {
    return "detailPages.salary.weekly"
  }

  if (value === "MONTHLY") {
    return "detailPages.salary.monthly"
  }

  return "detailPages.salary.notSpecified"
}

function renderMoneyValue(value: number, currencyLabel: string) {
  const formattedNumber = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(value)

  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono" dir="ltr">
      <span>{currencyLabel}</span>
      <span>{formattedNumber}</span>
    </span>
  )
}

export function SalariesSection({
  recentPayments,
  workers,
  onAddPayment,
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
  onAddPayment: (employeeId: string) => void
  onEditSalary: (employeeId: string) => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState("recent")
  const currencyLabel = t("detailPages.salary.currency")
  const sortedWorkers = useMemo(
    () => [...workers].sort((left, right) => left.employeeName.localeCompare(right.employeeName, "ar")),
    [workers],
  )

  return (
    <RecordPageFrame title={t("sections.salaries.label")} description={t("sections.salaries.description")}>
      <div className="flex flex-col gap-6" dir="rtl">
          <div className="flex justify-start">
            <RecordTabs
              activeTab={activeTab}
              tabs={[
                { id: "recent", label: t("salaries.recentTitle") },
                { id: "workers", label: t("salaries.workersTitle") },
              ]}
              onChange={setActiveTab}
            />
          </div>
          
          {activeTab === "recent" ? (
            <Surface className="p-5" variant="table">
              <SurfaceHeader title={t("salaries.recentTitle")} />
    
              <AppShellTableFrame className="mt-5 rounded-[24px]">
              <table className="min-w-full text-sm">
                <AppShellTableHead className="bg-muted/50">
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
                      <AppShellTableRow key={payment.id} className="bg-background/70 align-middle dark:bg-background/40">
                        <td className="px-4 py-4 text-start">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground" dir="auto">
                              {payment.employeeName}
                            </p>
                            <p className="text-xs text-muted-foreground" dir="auto">
                              {payment.employeeRole}
                            </p>
                            <p className="text-xs text-muted-foreground" dir="ltr">
                              {payment.employeePhone}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-start text-foreground">{new Intl.DateTimeFormat("ar-DZ").format(new Date(payment.paymentDate))}</td>
                        <td className="px-4 py-4 text-start text-foreground">{renderMoneyValue(payment.expectedAmountDzd, currencyLabel)}</td>
                        <td className="px-4 py-4 text-start text-foreground">{renderMoneyValue(payment.actualAmountDzd, currencyLabel)}</td>
                        <td className="px-4 py-4 text-start text-muted-foreground">{payment.note ?? t("common.noNotes")}</td>
                        <td className="px-4 py-4 text-end">
                          <AppShellActionGroup className="justify-end">
                            <Button size="xs" onClick={() => onAddPayment(payment.employeeId)}>
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
          </Surface>
          ) : null}

        {activeTab === "workers" ? (
          <Surface className="p-5" variant="table">
            <SurfaceHeader description={t("salaries.workersDescription")} title={t("salaries.workersTitle")} />

            <AppShellTableFrame className="mt-5 rounded-[24px]">
              <table className="min-w-full text-sm">
                <AppShellTableHead className="bg-muted/50">
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
                      <AppShellTableRow key={worker.employeeId} className="bg-background/70 align-middle dark:bg-background/40">
                        <td className="px-4 py-4 text-start">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground" dir="auto">
                              {worker.employeeName}
                            </p>
                            <p className="text-xs text-muted-foreground" dir="auto">
                              {worker.employeeRole}
                            </p>
                            <p className="text-xs text-muted-foreground" dir="ltr">
                              {worker.employeePhone}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-start text-foreground">
                          {worker.salaryAmountDzd !== null
                            ? (
                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                  {renderMoneyValue(worker.salaryAmountDzd, currencyLabel)}
                                  <span className="text-muted-foreground">/ {t(getSalaryPeriodLabelKey(worker.salaryPeriod))}</span>
                                </span>
                              )
                            : t("detailPages.salary.notSpecified")}
                        </td>
                        <td className="px-4 py-4 text-start text-muted-foreground">
                          {worker.lastPaymentDate ? new Intl.DateTimeFormat("ar-DZ").format(new Date(worker.lastPaymentDate)) : t("salaries.noPaymentsYet")}
                        </td>
                        <td className="px-4 py-4 text-end">
                          <AppShellActionGroup className="justify-end">
                            <Button size="xs" onClick={() => onAddPayment(worker.employeeId)}>
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
          </Surface>
        ) : null}
        </div>
    </RecordPageFrame>
  )
}
