import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Field } from "@/components/ui/field"
import { DatePicker } from "@/components/ui/date-picker"
import { useCreateSalaryPaymentMutation } from "@/features/app-shell/mock-dashboard"
import { AddSalaryPaymentDialog } from "./add-salary-payment-dialog"
import { DebtCasesPanel } from "@/features/debts/debt-cases-panel"
import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { classifyWorkforceRole } from "./role-classification"
import { workspaceRoutes } from "@/router/navigation"
import {
  RecordHistoryTable,
  RecordInfoCard,
  RecordInfoGrid,
  RecordPageFrame,
  RecordTabPanel,
  RecordTabs,
} from "@/features/shared/record-page-frame"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import type { EmployeeTableRow } from "./employee-table"

type EmployeeWorkHistoryRow = {
  id: string
  title: string
  detail?: string | null
  typeLabel: string
  periodLabel: string
  statusLabel: string
}

function getSalaryDifferenceMeta(expectedAmountDzd: number, actualAmountDzd: number) {
  const difference = actualAmountDzd - expectedAmountDzd

  if (difference > 0) {
    return {
      className: "text-emerald-700 dark:text-emerald-300",
      value: difference,
    }
  }

  if (difference < 0) {
    return {
      className: "text-rose-700 dark:text-rose-300",
      value: difference,
    }
  }

  return {
    className: "text-muted-foreground",
    value: difference,
  }
}

function getSalaryPeriodLabelKey(value: EmployeeTableRow["salaryPeriod"]) {
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

function renderMoneyValue(
  value: number,
  currencyLabel: string,
  options?: {
    signed?: boolean
    toneClassName?: string
    zeroAsDash?: boolean
  },
) {
  if (options?.zeroAsDash && value === 0) {
    return <span className={cn("text-muted-foreground", options?.toneClassName)}>—</span>
  }

  const formattedNumber = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    signDisplay: options?.signed ? "always" : "auto",
    useGrouping: false,
  }).format(value)

  return (
    <span className={cn("inline-flex items-baseline gap-1.5 font-mono", options?.toneClassName)} dir="ltr">
      <span>{currencyLabel}</span>
      <span>{formattedNumber}</span>
    </span>
  )
}

/** Employee detail page with tabs for personal, work, and finance. */
/**
 * @description Component
 */
export function EmployeeDetailsPage({
  activeTab,
  debtAccounts,
  debtEntriesByAccountId,
  employee,
  managedProjects,
  managedWarehouses,
  onTabChange,
  salaryPayments,
  workHistory,
}: {
  activeTab: string
  debtAccounts: DebtAccount[]
  debtEntriesByAccountId: Record<string, DebtEntry[]>
  employee: EmployeeTableRow
  managedProjects: string[]
  managedWarehouses: string[]
  onTabChange: (tabId: string) => void
  salaryPayments: Array<{
    id: string
    paymentDate: string
    expectedAmountDzd: number
    actualAmountDzd: number
    periodType: "DAILY" | "WEEKLY" | "MONTHLY"
    note: string | null
  }>
  workHistory: EmployeeWorkHistoryRow[]
}) {
  const { t } = useTranslation()
  const { isProjectManager, isWarehouseManager, isWorker } = classifyWorkforceRole(employee.roleKey)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const createSalaryPaymentMutation = useCreateSalaryPaymentMutation()
  const [paymentDate, setPaymentDate] = useState(() => getAlgeriaDateInputValue())
  const [actualAmount, setActualAmount] = useState(() => (employee.salaryAmountDzd !== null ? String(employee.salaryAmountDzd) : ""))
  const [note, setNote] = useState("")
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const availableTabs = isWorker ? ["personal", "history", "finance", "debts"] : ["personal", "history", "finance"]
  const resolvedTab = availableTabs.includes(activeTab) ? activeTab : "personal"
  const sortedSalaryPayments = useMemo(
    () => [...salaryPayments].sort((left, right) => right.paymentDate.localeCompare(left.paymentDate)),
    [salaryPayments],
  )
  const normalizedActualAmount = actualAmount.trim()
  const actualAmountValue = normalizedActualAmount.length > 0 ? Number(normalizedActualAmount) : null
  const hasValidActualAmount = actualAmountValue !== null && Number.isFinite(actualAmountValue) && actualAmountValue >= 0
  const totalExpectedAmount = sortedSalaryPayments.reduce((sum, payment) => sum + payment.expectedAmountDzd, 0)
  const totalActualAmount = sortedSalaryPayments.reduce((sum, payment) => sum + payment.actualAmountDzd, 0)
  const totalDifferenceMeta = getSalaryDifferenceMeta(totalExpectedAmount, totalActualAmount)
  const currencyLabel = t("detailPages.salary.currency")
  const salaryPeriodLabel = (value: EmployeeTableRow["salaryPeriod"]) => t(getSalaryPeriodLabelKey(value))
  const noNotesLabel = t("common.noNotes")
  // The #20 workplace placement flow persists only for ACTIVE workers, so
  // non-active workers must not get an edit-workplace CTA that would be
  // silently ignored.
  const canAssignWorkplace = isWorker && employee.status === "ACTIVE"
  const managedProjectCountLabel = managedProjects.length > 0 ? `${managedProjects.length} ${t("detailPages.employee.projectUnit")}` : t("detailPages.employee.noManagedProjects")
  const managedWarehouseCountLabel = managedWarehouses.length > 0 ? `${managedWarehouses.length} ${t("detailPages.employee.warehouseUnit")}` : t("detailPages.employee.noManagedWarehouses")
  const managedProjectNamesLabel = managedProjects.length > 0 ? managedProjects.join("، ") : t("detailPages.employee.noManagedProjectNames")
  const managedWarehouseNamesLabel = managedWarehouses.length > 0 ? managedWarehouses.join("، ") : t("detailPages.employee.noManagedWarehouseNames")
  const hasExpandedNotes = (employee.notes?.trim().length ?? 0) > 90
  const tabsBaseId = `employee-record-${employee.id}`

  useEffect(() => {
    setPaymentDate(getAlgeriaDateInputValue())
    setActualAmount(employee.salaryAmountDzd !== null ? String(employee.salaryAmountDzd) : "")
    setNote("")
    setShowPaymentForm(false)
  }, [employee.id, employee.salaryAmountDzd])

  useEffect(() => {
    if (!createSalaryPaymentMutation.isSuccess) {
      return
    }

    setPaymentDate(getAlgeriaDateInputValue())
    setActualAmount(employee.salaryAmountDzd !== null ? String(employee.salaryAmountDzd) : "")
    setNote("")
    setShowPaymentForm(false)
  }, [createSalaryPaymentMutation.isSuccess, employee.salaryAmountDzd])

  return (
    <RecordPageFrame
      backHref="/employees"
      backLabel={t("detailPages.employee.back")}
      description=""
      editHref={`/employees/${encodeURIComponent(employee.id)}/edit`}
      editLabel={t("detailPages.employee.edit")}
      title={employee.name}
      action={
        isWorker && employee.status === "ACTIVE" ? (
          <>
            <AddSalaryPaymentDialog
              employeeId={employee.id}
              employeeName={employee.name}
              salaryAmountDzd={employee.salaryAmountDzd}
              salaryPeriod={employee.salaryPeriod}
              open={paymentDialogOpen}
              onOpenChange={setPaymentDialogOpen}
            />
            <Button size="lg" onClick={() => setPaymentDialogOpen(true)}>
              {t("salaries.addPayment")}
            </Button>
          </>
        ) : undefined
      }
    >
      <RecordTabs
        activeTab={resolvedTab}
        baseId={tabsBaseId}
        tabs={[
          { id: "personal", label: t("detailPages.employee.personalTab") },
          { id: "history", label: t("detailPages.employee.historyTab") },
          { id: "finance", label: t("detailPages.employee.financeTab") },
          ...(isWorker ? [{ id: "debts", label: "الديون" }] : []),
        ]}
        onChange={onTabChange}
      />

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="personal">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecordInfoCard label={t("detailPages.employee.fullName")} value={employee.name} />
          <RecordInfoCard label={t("detailPages.employee.role")} value={employee.role} />
          <RecordInfoCard label={t("detailPages.employee.occupation")} value={employee.occupation?.trim() || t("detailPages.employee.noOccupation")} />
          <RecordInfoCard label={t("detailPages.employee.phone")} value={employee.phone} valueClassName="text-right font-mono" />
          <RecordInfoCard label={t("detailPages.employee.status")} value={getArabicStatusLabel(employee.status)} />
          {isWorker ? <RecordInfoCard label={t("detailPages.employee.currentManager")} value={employee.managerName || t("detailPages.employee.noCurrentManager")} /> : null}
          {isWorker ? <RecordInfoCard label={t("detailPages.employee.currentWorkplace")} value={employee.currentWorkplace || t("detailPages.employee.noCurrentWorkplace")} /> : null}
          {isProjectManager ? <RecordInfoCard label={t("detailPages.employee.managedProjectsCount")} value={managedProjectCountLabel} /> : null}
          {isProjectManager ? (
            <RecordInfoCard label={t("detailPages.employee.managedProjectsNames")} value={managedProjectNamesLabel} valueClassName="text-sm leading-7" />
          ) : null}
          {isWarehouseManager ? <RecordInfoCard label={t("detailPages.employee.managedWarehousesCount")} value={managedWarehouseCountLabel} /> : null}
          {isWarehouseManager ? (
            <RecordInfoCard label={t("detailPages.employee.managedWarehousesNames")} value={managedWarehouseNamesLabel} valueClassName="text-sm leading-7" />
          ) : null}
          <div className={hasExpandedNotes ? "md:col-span-2 xl:col-span-3" : undefined}>
            <RecordInfoCard label={t("detailPages.employee.notes")} value={employee.notes ?? noNotesLabel} wide={hasExpandedNotes} />
          </div>
        </div>
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="history">
        <RecordHistoryTable
          emptyAction={
            canAssignWorkplace
              ? { label: t("detailPages.employee.noWorkHistoryAction"), target: workspaceRoutes.employeeEdit(employee.id) }
              : undefined
          }
          emptyHint={canAssignWorkplace ? t("detailPages.employee.noWorkHistoryHint") : undefined}
          emptyLabel={t("detailPages.employee.noWorkHistory")}
          rows={workHistory}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="finance">
        <div className="space-y-6">
          <RecordInfoGrid>
            <RecordInfoCard
              label={t("detailPages.employee.financeCurrentSalary")}
              value={employee.salaryAmountDzd !== null ? renderMoneyValue(employee.salaryAmountDzd, currencyLabel) : t("detailPages.salary.notSpecified")}
            />
            <RecordInfoCard
              label={t("detailPages.employee.financeSalaryPeriod")}
              value={salaryPeriodLabel(employee.salaryPeriod)}
            />
            <RecordInfoCard label={t("detailPages.employee.financePaymentCount")} value={String(salaryPayments.length)} />
            <RecordInfoCard label={t("detailPages.employee.financeTotalExpected")} value={renderMoneyValue(totalExpectedAmount, currencyLabel)} />
            <RecordInfoCard label={t("detailPages.employee.financeTotalPaid")} value={renderMoneyValue(totalActualAmount, currencyLabel)} />
            <RecordInfoCard
              label={t("detailPages.employee.financeCumulativeDifference")}
              value={renderMoneyValue(totalDifferenceMeta.value, currencyLabel, {
                signed: true,
                toneClassName: totalDifferenceMeta.className,
                zeroAsDash: true,
              })}
            />
          </RecordInfoGrid>

          <div className="rounded-xl border border-border/70 bg-sidebar p-5 dark:bg-surface" dir="rtl">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" dir="rtl">
              <div className="space-y-1 text-start">
                <h3 className="text-lg font-semibold text-foreground">{t("detailPages.employee.financeSectionTitle")}</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("detailPages.employee.financeSectionDescription")}
                </p>
              </div>
              <Button
                disabled={employee.salaryAmountDzd === null || !employee.salaryPeriod}
                size="lg"
                variant={showPaymentForm ? "outline" : "default"}
                onClick={() => setShowPaymentForm((currentValue) => !currentValue)}
              >
                {showPaymentForm ? t("detailPages.employee.financeToggleHide") : t("detailPages.employee.financeToggleShow")}
              </Button>
            </div>

            {employee.salaryAmountDzd === null || !employee.salaryPeriod ? (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {t("detailPages.employee.financeMissingSalary")}
              </p>
            ) : null}

            {showPaymentForm ? (
              <div className="mt-5 space-y-4 rounded-xl border border-border/60 bg-surface-2 p-4">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-foreground">{t("detailPages.employee.financeFormTitle")}</h4>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("detailPages.employee.financeFormDescription")}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label={t("detailPages.employee.financePaymentDate")}>
                    <DatePicker value={paymentDate} onChange={setPaymentDate} />
                  </Field>
                  <Field label={t("detailPages.employee.financeExpectedAmount")}>
                    <CurrencyInput currencyLabel={currencyLabel} readOnly value={employee.salaryAmountDzd !== null ? String(employee.salaryAmountDzd) : t("detailPages.salary.notSpecified")} />
                  </Field>
                  <Field label={t("detailPages.employee.financeActualAmount")}>
                    <CurrencyInput currencyLabel={currencyLabel} placeholder="0" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} />
                  </Field>
                  <Field label={t("detailPages.employee.financePeriod")}>
                    <NativeSelect disabled value={employee.salaryPeriod ?? ""}>
                      <option value="">{t("detailPages.salary.notSpecified")}</option>
                      <option value="DAILY">{t("detailPages.salary.daily")}</option>
                      <option value="WEEKLY">{t("detailPages.salary.weekly")}</option>
                      <option value="MONTHLY">{t("detailPages.salary.monthly")}</option>
                    </NativeSelect>
                  </Field>
                  <Field label={t("detailPages.employee.notes")} className="md:col-span-2 xl:col-span-4">
                    <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                  </Field>
                </div>
                <div className="flex justify-start gap-3" dir="rtl">
                  <Button size="lg" variant="outline" onClick={() => setShowPaymentForm(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="lg"
                    disabled={employee.salaryAmountDzd === null || !employee.salaryPeriod || !hasValidActualAmount || createSalaryPaymentMutation.isPending}
                    onClick={() =>
                      createSalaryPaymentMutation.mutate({
                        employeeId: employee.id,
                        // A daily wage is paid per day; a monthly wage covers the
                        // 30-day month. The amount still overrides the proposal.
                        days: employee.salaryPeriod === "DAILY" ? 1 : 30,
                        actualAmountDzd: actualAmountValue!,
                        paymentDate: paymentDate ? toAlgeriaDayBoundaryIso(paymentDate, "start") : undefined,
                        note: note.trim() || null,
                      })
                    }
                  >
                    {t("detailPages.employee.financeSave")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-sidebar dark:bg-surface" dir="rtl">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" aria-label={t("detailPages.employee.financeSectionTitle")}>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableDate")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableExpected")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableActual")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableDifference")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableNotes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSalaryPayments.length > 0 ? (
                    sortedSalaryPayments.map((payment) => {
                      const difference = getSalaryDifferenceMeta(payment.expectedAmountDzd, payment.actualAmountDzd)

                      return (
                        <tr key={payment.id} className="border-t border-border/60 bg-sidebar dark:bg-background">
                          <td className="px-4 py-4 text-start text-foreground">{new Intl.DateTimeFormat("ar-DZ").format(new Date(payment.paymentDate))}</td>
                          <td className="px-4 py-4 text-start text-foreground">{renderMoneyValue(payment.expectedAmountDzd, currencyLabel)}</td>
                          <td className="px-4 py-4 text-start text-foreground">{renderMoneyValue(payment.actualAmountDzd, currencyLabel)}</td>
                          <td className="px-4 py-4 text-start font-medium">
                            {renderMoneyValue(difference.value, currencyLabel, {
                              signed: true,
                              toneClassName: difference.className,
                              zeroAsDash: true,
                            })}
                          </td>
                          <td className="px-4 py-4 text-start text-muted-foreground">{payment.note?.trim() ? payment.note : noNotesLabel}</td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                        {t("detailPages.employee.financeEmpty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </RecordTabPanel>

      {isWorker ? (
        <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="debts">
          <DebtCasesPanel
            accounts={debtAccounts}
            debtEntriesByAccountId={debtEntriesByAccountId}
            title="ديون العامل"
            workerId={employee.id}
          />
        </RecordTabPanel>
      ) : null}
    </RecordPageFrame>
  )
}
