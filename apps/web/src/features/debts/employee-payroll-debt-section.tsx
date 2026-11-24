import { i18n as featureI18n } from "@/i18n"
import { useId, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/form-controls"
import { MoneyValue } from "@/features/shared/money-value"
import { useEmployeePayrollQuery } from "@/features/employees/employee-earnings-queries"
import type { ExactDebtPartyOption } from "./debts-exact-page"

function History({ title, rows }: { title: string; rows: { id: string; content: ReactNode }[] }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)))
  return <div className="space-y-2"><h3 className="font-medium">{title}</h3>
    {rows.length === 0 ? <p>{t("debtPayroll.emptyHistory")}</p> : rows.slice((current - 1) * 25, current * 25).map(row => <div key={row.id} className="break-words border-b border-border py-2 text-sm">{row.content}</div>)}
    {rows.length > 25 && <nav aria-label={title} className="flex items-center gap-3"><Button variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>{t("debtPayroll.previous")}</Button><span>{current} / {Math.ceil(rows.length / 25)}</span><Button variant="outline" disabled={current * 25 >= rows.length} onClick={() => setPage(current + 1)}>{t("debtPayroll.next")}</Button></nav>}
  </div>
}

const money = (value: string) => <MoneyValue exact value={value} currencyLabel={featureI18n.t("featureCopy.employeePayrollDebtSection.currency")} />
const ref = (value: string) => <bdi dir="ltr">{value}</bdi>

/** Payroll is a separate authoritative read, never an addition to the ledger aggregate. */
export function EmployeePayrollDebtSection({ employees, scopedParty }: { employees: ExactDebtPartyOption[]; scopedParty?: ExactDebtPartyOption }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [selectedId, setSelectedId] = useState("")
  const workers = employees.filter(row => row.partyType === "INTERNAL_WORKER")
  const employee = scopedParty ? (scopedParty.partyType === "INTERNAL_WORKER" ? scopedParty : undefined) : workers.find(row => row.id === selectedId) ?? workers[0]
  const payroll = useEmployeePayrollQuery(employee?.id ?? "")
  if (scopedParty && scopedParty.partyType !== "INTERNAL_WORKER") return null
  const data = payroll.data
  return <section aria-labelledby={titleId} className="space-y-3 rounded-xl border border-border p-4">
    <h2 id={titleId} className="text-lg font-semibold">{t("debtPayroll.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("debtPayroll.ledgerExplanation")}</p>
    {!scopedParty && workers.length > 0 && <label className="block text-sm">{t("debtPayroll.employee")}<NativeSelect aria-label={t("debtPayroll.selectEmployee")} value={employee?.id ?? ""} onChange={event => setSelectedId(event.target.value)}>{workers.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label>}
    {!employee ? <p>{t("debtPayroll.noEmployee")}</p> : <>
      <Link to="/employees/$employeeId" params={{ employeeId: employee.id }} search={{ tab: "finance" }} className="text-sm underline">{t("debtPayroll.employeeProfile")}: {employee.label}</Link>
      {payroll.isPending ? <p role="status">{t("debtPayroll.loading")}</p> : payroll.isError ? <div role="alert">{t("debtPayroll.error")} <Button variant="outline" onClick={() => void payroll.refetch()}>{t("debtPayroll.retry")}</Button></div> : data && <div key={employee.id} className="space-y-3">
        {data.opening.reminder && <p role="note">{t("employeeOpening.unknown")}</p>}
        <div className="flex flex-wrap gap-8 border-y border-border py-3">
          <div><p>{t("debtPayroll.wagesOwed")}</p><MoneyValue exact aggregate value={data.summary.wagesOwed} currencyLabel={featureI18n.t("featureCopy.employeePayrollDebtSection.currency")} variant="detail" /></div>
          <div><p>{t("debtPayroll.advancesOwed")}</p><MoneyValue exact aggregate value={data.summary.advancesOwed} currencyLabel={featureI18n.t("featureCopy.employeePayrollDebtSection.currency")} variant="detail" /></div>
        </div>
        <History title={t("debtPayroll.earnings")} rows={data.earnings.map(item => ({ id: item.earning.id, content: <><AppDate value={item.earning.periodStart} /> · <AppDate value={item.earning.periodEnd} /> · {t("debtPayroll.earning")} {money(item.earning.totalAmount)} · {t("debtPayroll.remaining")} {money(item.remaining)} · {ref(item.earning.id)} · {t(item.registration === "POSTED" ? "debtPayroll.posted" : "debtPayroll.pending")}</> }))} />
        <History title={t("debtPayroll.advances")} rows={data.advances.map(item => ({ id: item.advance.id, content: <>{money(item.advance.amount)} · {t("debtPayroll.remaining")} {money(item.remaining)} · {ref(item.advance.id)}</> }))} />
        <History title={t("debtPayroll.cash")} rows={data.cash.map(item => ({ id: item.id, content: <>{money(item.amount)} · <AppDate value={item.paymentDate} /> · {ref(item.id)}{item.wageAllocations.map(allocation => <div key={allocation.id}>{t("debtPayroll.wageAllocation")} {money(allocation.amount)} · {ref(allocation.source.id)} · {ref(allocation.paymentEntryId)} · {ref(allocation.id)}</div>)}{item.advance && <div>{t("debtPayroll.advancePortion")} {money(item.advance.amount)} · {ref(item.advance.id)}</div>}</> }))} />
        <History title={t("debtPayroll.recoveries")} rows={data.repayments.map(item => ({ id: item.id, content: <>{money(item.amount)} · <AppDate value={item.paymentDate} /> · {ref(item.id)} · {ref(item.source.id)} · {ref(item.paymentEntryId)}</> }))} />
        <History title={t("debtPayroll.offsets")} rows={data.offsets.map(item => ({ id: item.id, content: <>{money(item.amount)} · <AppDate value={item.settlementDate} /> · {ref(item.id)} · {ref(item.advanceSource.id)} · {ref(item.wageSource.id)} · {ref(item.wage.settlementEntryId)} · {ref(item.advance.settlementEntryId)}</> }))} />
      </div>}
    </>}
  </section>
}
