import { useRef, useState } from "react"
import { ORPCError } from "@orpc/client"
import { useTranslation } from "react-i18next"
import { exactSalaryMonthlyApprovalResultSchema, type ExactSalaryMonthAmount, type ExactSalaryMonthlyAmounts, type ExactSalaryMonthlyApprovalInput, type ExactWorkforceClient } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoneyValue } from "@/features/shared/money-value"
import { ExactMonthlySalaryEditor } from "./exact-monthly-salary-editor"
import { buildSalaryMonthlyApproval, emptySalaryAllocation, salaryAllocationRemainder, type SalaryAllocationDraft } from "./exact-monthly-salary-allocation"

type ApprovalResult = Awaited<ReturnType<ExactWorkforceClient["approveMonthlyEarnings"]>>
type Props = {
  employeeId: string
  defaultMonth: string
  initialMonths?: readonly ExactSalaryMonthAmount[]
  projects: readonly { id: string; name: string }[]
  client: Pick<ExactWorkforceClient, "approveMonthlyEarnings">
  busy?: boolean
}

/** Inject an opt-in client and mount keyed by workspace/employee. Never registers a production route. */
export function ExactMonthlySalaryApprovalForm({ employeeId, defaultMonth, initialMonths, projects, client, busy = false }: Props) {
  const { t, i18n } = useTranslation()
  const [allocations, setAllocations] = useState<Record<string, SalaryAllocationDraft>>({})
  const [locked, setLocked] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [approved, setApproved] = useState<ApprovalResult | null>(null)
  const attempt = useRef<{ input: ExactSalaryMonthlyApprovalInput; ambiguous: boolean } | null>(null)
  const projectIds = new Set(projects.map(row => row.id))

  function change(id: string, update: (value: SalaryAllocationDraft) => SalaryAllocationDraft) {
    if (busy || attempt.current !== null || approved !== null) return
    setAllocations(previous => ({ ...previous, [id]: update(previous[id] ?? emptySalaryAllocation()) }))
  }
  function valid(months: readonly ExactSalaryMonthAmount[]): boolean {
    try { buildSalaryMonthlyApproval("draft", employeeId, months, allocations, projectIds); return true } catch { return false }
  }
  async function approve(plan: ExactSalaryMonthlyAmounts) {
    if (!attempt.current) attempt.current = { input: buildSalaryMonthlyApproval(crypto.randomUUID(), employeeId, plan.months, allocations, projectIds), ambiguous: false }
    const current = attempt.current
    setLocked(true)
    try {
      const result = exactSalaryMonthlyApprovalResultSchema.parse(await client.approveMonthlyEarnings(structuredClone(current.input)))
      setApproved(result)
      setUncertain(false)
    } catch (error) {
      // Only a first, explicit pre-commit rejection permits a new intent. An earlier lost response stays unresolved.
      const rejected = !current.ambiguous && error instanceof ORPCError && ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"].includes(error.code)
      if (rejected) { attempt.current = null; setLocked(false) }
      else { current.ambiguous = true; setUncertain(true) }
      throw error
    }
  }

  return <section dir={i18n.dir()} className="space-y-4">
    <ExactMonthlySalaryEditor defaultMonth={defaultMonth} initialMonths={initialMonths} onApprove={approve} busy={busy || approved !== null} lockDraft={locked}
      approvalReady={plan => attempt.current !== null || valid(plan.months)} submitLabel={uncertain ? t("salaryAllocations.retrySame") : undefined}
      renderMonthDetails={(row, index) => {
        const draft = allocations[row.id] ?? emptySalaryAllocation()
        const remainder = salaryAllocationRemainder(row.amount, draft)
        const rowValid = valid([row])
        return <fieldset disabled={busy || locked || approved !== null} className="space-y-3 border-t pt-3">
          <legend className="text-sm font-medium">{t("salaryAllocations.title", { index: index + 1 })}</legend>
          <p className="text-sm text-muted-foreground">{t("salaryAllocations.help")}</p>
          {draft.segments.map((segment, at) => <div key={segment.id} className="grid gap-2 sm:grid-cols-2">
            <label className="min-w-0 space-y-1 text-sm">{t("salaryAllocations.project", { index: index + 1, segment: at + 1 })}
              <select className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={segment.projectId} onChange={event => change(row.id, value => ({ ...value, segments: value.segments.map(item => item.id === segment.id ? { ...item, projectId: event.target.value } : item) }))}>
                <option value="">{t("salaryAllocations.selectProject")}</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-sm">{t("salaryAllocations.amount", { index: index + 1, segment: at + 1 })}
              <Input className="min-h-11" dir="ltr" inputMode="decimal" value={segment.amount} onChange={event => change(row.id, value => ({ ...value, segments: value.segments.map(item => item.id === segment.id ? { ...item, amount: event.target.value } : item) }))} />
            </label>
            <label className="min-w-0 space-y-1 text-sm">{t("salaryAllocations.days", { index: index + 1, segment: at + 1 })}
              <Input className="min-h-11" dir="ltr" type="number" min={1} step={1} value={segment.days} onChange={event => change(row.id, value => ({ ...value, segments: value.segments.map(item => item.id === segment.id ? { ...item, days: event.target.value } : item) }))} />
            </label>
            <Button type="button" variant="outline" className="min-h-11 self-end" onClick={() => change(row.id, value => ({ ...value, segments: value.segments.filter(item => item.id !== segment.id) }))}>{t("salaryAllocations.remove", { index: index + 1, segment: at + 1 })}</Button>
          </div>)}
          <Button type="button" variant="outline" className="min-h-11" disabled={projects.length === 0 || draft.segments.length >= 9999} onClick={() => change(row.id, value => ({ ...value, segments: [...value.segments, { id: crypto.randomUUID(), projectId: "", amount: "", days: "" }] }))}>{t("salaryAllocations.add", { index: index + 1 })}</Button>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 space-y-1 text-sm">{t("salaryAllocations.unallocated", { index: index + 1 })}
              <Input className="min-h-11" dir="ltr" inputMode="decimal" value={draft.unallocatedAmount} onChange={event => change(row.id, value => ({ ...value, unallocatedAmount: event.target.value }))} />
            </label>
            <Button type="button" variant="outline" className="min-h-11" disabled={remainder === null} onClick={() => { if (remainder !== null) change(row.id, value => ({ ...value, unallocatedAmount: remainder })) }}>{t("salaryAllocations.useRemainder", { index: index + 1 })}</Button>
          </div>
          {projects.length === 0 && <p className="text-sm text-muted-foreground">{t("salaryAllocations.noProjects")}</p>}
          <p role="status" className="text-sm text-muted-foreground">{rowValid ? t("salaryAllocations.valid") : t("salaryAllocations.invalid")}</p>
        </fieldset>
      }} />
    {uncertain && <p role="status" className="text-sm">{t("salaryAllocations.uncertain")}</p>}
    {approved && <section aria-label={t("salaryAllocations.approved")} className="space-y-3 border-t pt-4">
      <h3 role="status" className="font-medium">{t("salaryAllocations.approved")}</h3>
      <p className="text-sm text-muted-foreground">{t("salaryAllocations.approvedHelp")}</p>
      <ul className="space-y-2">{approved.months.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2"><bdi dir="ltr">{row.month}</bdi><MoneyValue exact value={row.earning.approvedAmount} currencyLabel={t("common.currency")} /></li>)}</ul>
      <div className="flex flex-wrap justify-between gap-2 font-medium"><span>{t("salaryMonthly.total")}</span><MoneyValue exact aggregate value={approved.totalAmount} currencyLabel={t("common.currency")} /></div>
    </section>}
  </section>
}
