import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { type ExactSalaryMonthAmount, type ExactSalaryMonthlyAmounts, type ExactSalaryMonthlyApprovalInput, type ExactWorkforceEarningsClient } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoneyValue } from "@/features/shared/money-value"
import { ExactMonthlySalaryEditor } from "./exact-monthly-salary-editor"
import { buildSalaryMonthlyApproval, emptySalaryAllocation, salaryAllocationRemainder, type SalaryAllocationDraft } from "./exact-monthly-salary-allocation"
import { browserMonthlyApprovalStore, createMonthlyApprovalExecutor } from "./exact-monthly-approval-recovery"

type ApprovalResult = Awaited<ReturnType<ExactWorkforceEarningsClient["approveMonthlyEarnings"]>>
export type SalaryApprovalState = "idle" | "pending" | "uncertain" | "approved"
type Props = {
  employeeId: string
  workspaceId: string
  userId: string
  defaultMonth: string
  initialMonths?: readonly ExactSalaryMonthAmount[]
  projects: readonly { id: string; name: string }[]
  client: Pick<ExactWorkforceEarningsClient, "approveMonthlyEarnings">
  busy?: boolean
  onAttemptStateChange?: (state: SalaryApprovalState) => void
}

/** Uses the normal authenticated workforce client and a workspace/user-scoped durable approval intent. */
export function ExactMonthlySalaryApprovalForm({ employeeId, workspaceId, userId, defaultMonth, initialMonths, projects, client, busy = false, onAttemptStateChange }: Props) {
  const { t, i18n } = useTranslation()
  const [executorState] = useState(() => {
    const store = browserMonthlyApprovalStore(workspaceId, userId)
    const executor = createMonthlyApprovalExecutor({ store, execute: input => client.approveMonthlyEarnings(input) })
    return { executor, record: executor.record }
  })
  const recovered = executorState.record
  const [allocations, setAllocations] = useState<Record<string, SalaryAllocationDraft>>(() => Object.fromEntries((recovered?.payload.months ?? []).map(month => [month.id, {
    unallocatedAmount: month.unallocatedAmount,
    segments: month.segments.map(segment => ({ id: segment.id, projectId: segment.projectId, amount: segment.amount, days: segment.days === undefined ? "" : String(segment.days) })),
  }])))
  const [locked, setLocked] = useState(Boolean(recovered))
  const [uncertain, setUncertain] = useState(Boolean(recovered))
  const [approved, setApproved] = useState<ApprovalResult | null>(null)
  const attempt = useRef<{ input: ExactSalaryMonthlyApprovalInput; ambiguous: boolean } | null>(recovered ? { input: recovered.payload, ambiguous: true } : null)
  const projectIds = new Set(projects.map(row => row.id))
  useEffect(() => { onAttemptStateChange?.(recovered ? "uncertain" : "idle") }, [onAttemptStateChange, recovered])

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
    onAttemptStateChange?.("pending")
    try {
      const result = await executorState.executor.run(current.input) as ApprovalResult
      setApproved(result)
      setUncertain(false)
      onAttemptStateChange?.("approved")
    } catch (error) {
      const stillPending = executorState.executor.record !== null
      if (!stillPending) { attempt.current = null; setLocked(false) }
      else { current.ambiguous = true; setUncertain(true); onAttemptStateChange?.("uncertain") }
      if (!executorState.executor.record) onAttemptStateChange?.("idle")
      throw error
    }
  }

  return <section dir={i18n.dir()} className="space-y-4">
    <ExactMonthlySalaryEditor defaultMonth={defaultMonth} initialMonths={recovered?.payload.months ?? initialMonths} onApprove={approve} busy={busy || approved !== null} lockDraft={locked}
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
