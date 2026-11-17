import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, NativeSelect } from "@/components/ui/form-controls"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useApproveEmployeeEarningMutation } from "@/features/employees/employee-earnings-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
import {
  editEarningDraftRow,
  loadPendingEmployeeEarning,
  markEmployeeEarningPending,
  removePendingEmployeeEarning,
  type EarningDraftIdentity,
  type PendingEmployeeEarning,
  type EmployeeEarningDraft,
  type EmployeeEarningDraftRow,
} from "@/features/employees/employee-earning-draft"
import { resolveApiBaseUrl } from "@/lib/runtime-config"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { translateRpcValidationIssues } from "@/lib/rpc-error-handling"

export type SalaryProjectOption = { id: string; name: string }

const newRow = (): EmployeeEarningDraftRow => ({ id: crypto.randomUUID(), projectId: "", daysText: "", amountText: "" })
const dateFromBoundary = (value: string) => value.slice(0, 10)

/** Approval composer kept at the existing shared-dialog import site for callers being migrated. */
export function AddSalaryPaymentDialog({
  employeeId,
  employeeName,
  salaryReference,
  projects,
  open,
  onOpenChange,
}: {
  employeeId: string | null
  employeeName?: string | null
  salaryReference?: { period: "DAILY" | "WEEKLY" | "MONTHLY"; amount: string } | null
  projects: SalaryProjectOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const session = useSessionQuery()
  const userId = session.data?.user?.id ?? null
  const mutation = useApproveEmployeeEarningMutation()
  const workspaceId = useMemo(() => {
    try { return resolveApiBaseUrl() } catch { return null }
  }, [])
  const identity = useMemo<EarningDraftIdentity | null>(() => userId && employeeId && workspaceId
    ? { userId, workspaceId, employeeId }
    : null, [userId, workspaceId, employeeId])
  const [periodStart, setPeriodStart] = useState(getAlgeriaDateInputValue())
  const [periodEnd, setPeriodEnd] = useState(getAlgeriaDateInputValue())
  const [total, setTotal] = useState("")
  const [unallocated, setUnallocated] = useState("")
  const [rows, setRows] = useState<EmployeeEarningDraftRow[]>([])
  const [pending, setPending] = useState<PendingEmployeeEarning | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [error, setError] = useState("")
  const [issues, setIssues] = useState<Array<{ path: (string | number)[]; message: string }>>([])
  const frozen = pending !== null
  const previousIdentity = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (!identity) {
      setPending(null)
      setTotal("")
      setUnallocated("")
      setRows([])
      return
    }
    const identityKey = JSON.stringify([identity.userId, identity.workspaceId, identity.employeeId])
    const identityChanged = previousIdentity.current !== identityKey
    previousIdentity.current = identityKey
    if (identityChanged) {
      setPending(null)
      setPeriodStart(getAlgeriaDateInputValue())
      setPeriodEnd(getAlgeriaDateInputValue())
      setTotal("")
      setUnallocated("")
      setRows([])
    }
    try {
      const loaded = loadPendingEmployeeEarning(identity, window.localStorage)
      if (!loaded.ok) { setStorageError(true); return }
      setStorageError(false)
      setPending(loaded.pending)
      setError("")
      if (loaded.pending) {
        const payload = loaded.pending.payload
        setPeriodStart(dateFromBoundary(payload.periodStart))
        setPeriodEnd(dateFromBoundary(payload.periodEnd))
        setTotal(payload.totalAmount)
        setUnallocated(payload.unallocatedAmount)
        setRows(payload.segments.map(segment => ({ id: segment.id, projectId: segment.projectId, daysText: String(segment.days), amountText: segment.amount })))
      }
    } catch {
      setStorageError(true)
    }
  }, [open, identity])

  const draft: EmployeeEarningDraft = {
    employeeId: employeeId ?? "",
    periodStart: toAlgeriaDayBoundaryIso(periodStart, "start") ?? "",
    periodEnd: toAlgeriaDayBoundaryIso(periodEnd, "end") ?? "",
    totalAmountText: total,
    unallocatedAmountText: unallocated,
    rows,
    referenceSalary: salaryReference,
  }

  const addRow = () => setRows(current => [...current, newRow()])
  const updateRow = (id: string, patch: Partial<Omit<EmployeeEarningDraftRow, "id">>) =>
    setRows(current => editEarningDraftRow({ ...draft, rows: current }, id, patch).rows)
  const removeRow = (id: string) => setRows(current => current.filter(row => row.id !== id))
  const displayIssue = (issue: { message: string } | undefined) => issue?.message

  const submit = async () => {
    setError("")
    setIssues([])
    if (!identity) { setError(t("earnings.identityRequired")); return }
    if (storageError) { setError(t("earnings.storageUnavailable")); return }
    let mutationSucceeded = false
    try {
      let payload = pending?.payload
      if (!payload) {
        let result
        try {
          result = markEmployeeEarningPending(draft, identity, window.localStorage, () => crypto.randomUUID())
        } catch {
          setStorageError(true)
          setError(t("earnings.storageUnavailable"))
          return
        }
        if (!result.ok) {
          if (result.issue) { setStorageError(true); setError(t("earnings.storageUnavailable")); return }
          setIssues(result.issues.map(issue => ({ path: issue.path, message: t(issue.message) })))
          return
        }
        payload = result.payload
        setPending({ version: 1, identity, payload })
      }
      await mutation.mutateAsync(payload)
      mutationSucceeded = true
      removePendingEmployeeEarning(identity, window.localStorage)
      setPending(null)
      setTotal("")
      setUnallocated("")
      setRows([])
      onOpenChange(false)
    } catch (cause) {
      if (mutationSucceeded) {
        setStorageError(true)
        setError(t("earnings.storageUnavailable"))
        return
      }
      const validation = translateRpcValidationIssues(cause)
      setIssues(validation.map(issue => {
        const path = [...issue.path]
        if (path[0] === "segments" && typeof path[1] === "number") path.splice(0, 2, "rows", rows[path[1]]?.id ?? String(path[1]))
        return { path, message: issue.message }
      }))
      setError(validation.length ? "" : cause instanceof Error ? cause.message : t("earnings.submitError"))
    }
  }

  const busy = mutation.isPending
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("earnings.title")}</DialogTitle>
        {employeeName ? <p className="text-sm text-muted-foreground" dir="auto">{employeeName}</p> : null}
      </DialogHeader>
      {pending ? <p role="status" className="rounded-xl border border-border/60 bg-surface-2 p-3 text-sm">{t("earnings.pendingApproval")}</p> : null}
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="space-y-4" aria-busy={busy}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2"><span className="text-sm font-medium">{t("earnings.periodStart")}</span><DatePicker id={t("earnings.periodStart")} value={periodStart} onChange={setPeriodStart} disabled={frozen || busy} /></label>
          <label className="flex flex-col gap-2"><span className="text-sm font-medium">{t("earnings.periodEnd")}</span><DatePicker id={t("earnings.periodEnd")} value={periodEnd} onChange={setPeriodEnd} disabled={frozen || busy} /></label>
          <label className="flex flex-col gap-2"><span className="text-sm font-medium">{t("earnings.total")}</span><CurrencyInput aria-label={t("earnings.total")} value={total} onChange={event => setTotal(event.target.value)} disabled={frozen || busy} /></label>
          <label className="flex flex-col gap-2"><span className="text-sm font-medium">{t("earnings.unallocated")}</span><CurrencyInput aria-label={t("earnings.unallocated")} value={unallocated} onChange={event => setUnallocated(event.target.value)} disabled={frozen || busy} /></label>
        </div>
        <section className="space-y-3 rounded-xl border border-border/60 bg-surface-2 p-4" aria-label={t("earnings.projectRows")}>
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{t("earnings.projectRows")}</h3><Button type="button" size="xs" variant="outline" onClick={addRow} disabled={frozen || busy}>{t("earnings.addProjectRow")}</Button></div>
          {rows.map((row, index) => <div key={row.id} className="grid gap-3 sm:grid-cols-[1fr_100px_140px_auto] sm:items-end">
            <label className="flex flex-col gap-1"><span className="text-xs text-ink-3">{t("earnings.project")}</span><NativeSelect aria-label={t("earnings.project")} value={row.projectId} disabled={frozen || busy} onChange={event => updateRow(row.id, { projectId: event.target.value })}><option value="">{t("earnings.selectProject")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect></label>
            <label className="flex flex-col gap-1"><span className="text-xs text-ink-3">{t("earnings.days")}</span><Input aria-label={t("earnings.days")} type="number" min={1} step={1} inputMode="numeric" dir="ltr" value={row.daysText} disabled={frozen || busy} onChange={event => updateRow(row.id, { daysText: event.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs text-ink-3">{t("earnings.amount")}</span><CurrencyInput aria-label={t("earnings.amount")} value={row.amountText} disabled={frozen || busy} onChange={event => updateRow(row.id, { amountText: event.target.value })} /></label>
            <Button type="button" size="xs" variant="ghost" onClick={() => removeRow(row.id)} disabled={frozen || busy}>{t("earnings.removeProjectRow", { number: index + 1 })}</Button>
          </div>)}
        </section>
        {issues.length ? <div role="alert" className="space-y-1 text-sm text-destructive">{issues.map((issue, index) => <p key={`${issue.path.join(".")}-${index}`}>{displayIssue(issue)}</p>)}</div> : null}
        {storageError ? <p role="alert" className="text-sm text-destructive">{t("earnings.storageUnavailable")}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={!identity || busy || storageError}>{busy ? t("earnings.approving") : frozen ? t("earnings.retryApproval") : t("earnings.approve")}</Button>
      </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
