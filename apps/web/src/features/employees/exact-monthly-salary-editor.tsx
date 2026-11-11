import { useId, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { exactSalaryMonthlyAmountsSchema, suggestExactSalaryMonthAmounts, exactSalaryDaysSchema, type ExactSalaryMonthAmount, type ExactSalaryMonthlyAmounts, type ExactSalaryMonthProposal } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoneyValue } from "@/features/shared/money-value"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"

type DraftMonth = ExactSalaryMonthAmount & { days: string }
type Basis = "EQUAL" | "WORK_DAYS" | "CALENDAR_DAYS"

type Props = {
  defaultMonth: string
  initialMonths?: readonly ExactSalaryMonthAmount[]
  onApprove: (value: ExactSalaryMonthlyAmounts) => void | Promise<void>
  busy?: boolean
}

function normalize(rows: readonly ExactSalaryMonthAmount[]): ExactSalaryMonthlyAmounts | null {
  try {
    return exactSalaryMonthlyAmountsSchema.parse({ currency: "DZD", months: rows.map(row => ({ id: row.id, month: row.month, amount: parseLocalizedMoneyInput(row.amount).toWire() })) })
  } catch { return null }
}

/** Mount keyed by employee. Initial months seed a draft once; this form never posts cash. */
export function ExactMonthlySalaryEditor({ defaultMonth, initialMonths, onApprove, busy = false }: Props) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const [rows, setRows] = useState<DraftMonth[]>(() => initialMonths?.map(row => ({ ...row, days: "" })) ?? [{ id: crypto.randomUUID(), month: defaultMonth, amount: "", days: "" }])
  const [helperOpen, setHelperOpen] = useState(false)
  const [target, setTarget] = useState(() => initialMonths ? normalize(initialMonths)?.totalAmount ?? "" : "")
  const [basis, setBasis] = useState<Basis>("EQUAL")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [proposal, setProposal] = useState<ExactSalaryMonthProposal | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ rows: DraftMonth[]; baseline: string | null } | null>(null)
  const [suggestionFailed, setSuggestionFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const plan = normalize(rows)
  const fingerprint = plan ? JSON.stringify(plan) : null
  const alreadySubmitted = submitted !== null && submitted === fingerprint
  const disabled = busy || submitting

  function invalidateSuggestion() {
    setProposal(null)
    setUndo(null)
    setSuggestionFailed(false)
  }

  function change(next: DraftMonth[]) {
    setRows(next)
    setFailed(false)
    invalidateSuggestion()
  }

  function calculate() {
    invalidateSuggestion()
    try {
      setProposal(suggestExactSalaryMonthAmounts({
        currency: "DZD", totalAmount: parseLocalizedMoneyInput(target).toWire(),
        months: rows.map(row => ({ id: row.id, month: row.month, ...(basis === "WORK_DAYS" ? { days: exactSalaryDaysSchema.parse(Number(row.days)) } : {}) })),
        calculation: basis === "CALENDAR_DAYS" ? { basis, periodStart, periodEnd } : { basis },
      }))
    } catch { setSuggestionFailed(true) }
  }

  function apply() {
    if (!proposal) return
    const previous = { rows: rows.map(row => ({ ...row })), baseline }
    change(rows.map((row, index) => ({ ...row, amount: proposal.months[index]!.amount })))
    setBaseline(proposal.totalAmount)
    setUndo(previous)
    setHelperOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (disabled || alreadySubmitted || inFlight.current || !plan) return
    inFlight.current = true
    setSubmitting(true)
    setFailed(false)
    try {
      await onApprove(plan)
      setSubmitted(JSON.stringify(plan))
    } catch { setFailed(true) }
    finally { inFlight.current = false; setSubmitting(false) }
  }

  return <form onSubmit={submit} dir={i18n.dir()} aria-label={t("salaryMonthly.title")}>
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="text-base font-medium">{t("salaryMonthly.title")}</legend>
      <p className="text-sm text-muted-foreground">{t("salaryMonthly.help")}</p>
      {rows.map((row, index) => <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="min-w-0 space-y-1 text-sm">{t("salaryMonthly.month", { index: index + 1 })}
          <Input className="min-h-11" type="month" dir="ltr" value={row.month} onChange={event => change(rows.map((item, at) => at === index ? { ...item, month: event.target.value } : item))} aria-describedby={`${id}-status`} />
        </label>
        <label className="min-w-0 space-y-1 text-sm">{t("salaryMonthly.amount", { index: index + 1 })}
          <Input className="min-h-11" inputMode="decimal" dir="ltr" value={row.amount} onChange={event => change(rows.map((item, at) => at === index ? { ...item, amount: event.target.value } : item))} aria-describedby={`${id}-status`} />
        </label>
        <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label={t("salaryMonthly.remove", { index: index + 1 })} disabled={rows.length === 1} onClick={() => change(rows.filter((_, at) => at !== index))}>×</Button>
      </div>)}
      <Button type="button" variant="outline" className="min-h-11" disabled={rows.length >= 10000} onClick={() => change([...rows, { id: crypto.randomUUID(), month: "", amount: "", days: "" }])}>{t("salaryMonthly.add")}</Button>
      <details open={helperOpen} className="space-y-3 border-t pt-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={event => { event.preventDefault(); setHelperOpen(!helperOpen) }}><span>{t("salaryMonthly.distribute")}</span>{" "}<small className="text-muted-foreground">{t("salaryMonthly.optional")}</small></summary>
        <p className="text-sm text-muted-foreground">{t("salaryMonthly.helperHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">{t("salaryMonthly.target")}<Input className="min-h-11" dir="ltr" inputMode="decimal" value={target} onChange={event => { setTarget(event.target.value); invalidateSuggestion() }} /></label>
          <label className="space-y-1 text-sm">{t("salaryMonthly.basis")}<select className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={basis} onChange={event => { setBasis(event.target.value as Basis); invalidateSuggestion() }}>
            <option value="EQUAL">{t("salaryMonthly.equal")}</option><option value="WORK_DAYS">{t("salaryMonthly.workDays")}</option><option value="CALENDAR_DAYS">{t("salaryMonthly.calendarDays")}</option>
          </select></label>
        </div>
        {basis === "WORK_DAYS" && rows.map((row, index) => <label key={row.id} className="block space-y-1 text-sm">{t("salaryMonthly.days", { index: index + 1 })}<Input className="min-h-11" type="text" inputMode="numeric" dir="ltr" value={row.days} onChange={event => change(rows.map((item, at) => at === index ? { ...item, days: event.target.value } : item))} /></label>)}
        {basis === "CALENDAR_DAYS" && <><div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">{t("salaryMonthly.periodStart")}<Input className="min-h-11" type="date" value={periodStart} onChange={event => { setPeriodStart(event.target.value); invalidateSuggestion() }} /></label>
          <label className="space-y-1 text-sm">{t("salaryMonthly.periodEnd")}<Input className="min-h-11" type="date" value={periodEnd} onChange={event => { setPeriodEnd(event.target.value); invalidateSuggestion() }} /></label>
        </div><p className="text-sm text-muted-foreground">{t("salaryMonthly.calendarHelp")}</p></>}
        <Button type="button" variant="outline" className="min-h-11" onClick={calculate}>{t("salaryMonthly.calculate")}</Button>
      </details>
      {suggestionFailed && <p role="alert" className="text-sm text-destructive">{t("salaryMonthly.suggestionInvalid")}</p>}
      {proposal && <section aria-label={t("salaryMonthly.preview")} aria-live="polite" className="space-y-3 rounded-md border p-4">
        <h3 className="font-medium">{t("salaryMonthly.preview")}</h3>
        <ul className="space-y-2">{proposal.months.map((row, index) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2"><span><bdi dir="ltr">{row.month}</bdi> {proposal.calculation.basis !== "EQUAL" && t("salaryMonthly.daysWeight", { days: proposal.weights[index]!.weight })}</span><MoneyValue exact value={row.amount} currencyLabel={t("common.currency")} /></li>)}</ul>
        <p className="text-sm text-muted-foreground">{t("salaryMonthly.roundingHelp")}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" onClick={apply}>{t("salaryMonthly.apply")}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => setProposal(null)}>{t("salaryMonthly.cancel")}</Button></div>
      </section>}
      {undo && <Button type="button" variant="outline" className="min-h-11" onClick={() => { const previous = undo; change(previous.rows); setBaseline(previous.baseline) }}>{t("salaryMonthly.undo")}</Button>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <span>{t("salaryMonthly.total")}</span>
        {plan ? <MoneyValue exact aggregate value={plan.totalAmount} currencyLabel={t("common.currency")} /> : <span>—</span>}
      </div>
      <p id={`${id}-status`} role="status" className="text-sm text-muted-foreground">{plan ? t("salaryMonthly.help") : t("salaryMonthly.invalid")}</p>
      {plan && baseline && plan.totalAmount !== baseline && <div role="status" className="space-y-2 text-sm">
        <p>{t("salaryMonthly.totalChanged")}</p>
        <div className="flex flex-wrap justify-between gap-2"><span>{t("salaryMonthly.suggestedTotal")}</span><MoneyValue exact aggregate value={baseline} currencyLabel={t("common.currency")} /></div>
        <div className="flex flex-wrap justify-between gap-2"><span>{t("salaryMonthly.currentTotal")}</span><MoneyValue exact aggregate value={plan.totalAmount} currencyLabel={t("common.currency")} /></div>
      </div>}
      {failed && <p role="alert" className="text-sm text-destructive">{t("salaryMonthly.approvalFailed")}</p>}
      <Button type="submit" className="min-h-11" disabled={!plan || alreadySubmitted}>{submitting ? t("common.loading") : <>{t("salaryMonthly.approve")} {plan && <MoneyValue exact aggregate value={plan.totalAmount} currencyLabel={t("common.currency")} />}</>}</Button>
    </fieldset>
  </form>
}
