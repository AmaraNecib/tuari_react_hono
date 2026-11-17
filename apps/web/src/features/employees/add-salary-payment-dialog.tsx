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
const dateFromBoundary = (value: string) => getAlgeriaDateInputValue(new Date(value))
type DialogIssue = { path: (string | number)[]; message: string }

function normalizeIssuePath(path: Array<string | number>, rows: EmployeeEarningDraftRow[]): (string | number)[] {
  const [root, segment, field, ...rest] = path
  const topFields: Record<string, string> = {
    totalAmount: "totalAmountText",
    unallocatedAmount: "unallocatedAmountText",
  }
  if (root === "segments" && (typeof segment === "number" || typeof segment === "string")) {
    const rowId = typeof segment === "number" ? rows[segment]?.id ?? String(segment) : segment
    const rowFields: Record<string, string> = { projectId: "projectId", days: "daysText", daysText: "daysText", amount: "amountText", amountText: "amountText" }
    return ["rows", rowId, rowFields[String(field)] ?? String(field), ...rest]
  }
  return [topFields[String(root)] ?? String(root), ...(segment === undefined ? [] : [segment]), ...(field === undefined ? [] : [field]), ...rest]
}

function hasKnownContractValidationIssues(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) return false
  const data = (error as { data?: unknown }).data
  if (typeof data !== "object" || data === null || !("issues" in data)) return false
  const rawIssues = (data as { issues?: unknown }).issues
  if (!Array.isArray(rawIssues) || rawIssues.length === 0) return false
  const translated = translateRpcValidationIssues(error)
  return translated.length === rawIssues.length && rawIssues.every((issue, index) =>
    typeof issue === "object" && issue !== null && "message" in issue &&
    typeof (issue as { message?: unknown }).message === "string" &&
    translated[index]?.message !== (issue as { message: string }).message,
  )
}

function appFieldIssues(error: unknown): DialogIssue[] {
  if (typeof error !== "object" || error === null || !("fieldErrors" in error)) return []
  const fieldErrors = (error as { fieldErrors?: unknown }).fieldErrors
  if (!Array.isArray(fieldErrors)) return []
  const entries = fieldErrors.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return []
    const value = candidate as { field?: unknown; message?: unknown }
    if (typeof value.field !== "string" || typeof value.message !== "string") return []
    const path = value.field.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).map(part => /^\d+$/.test(part) ? Number(part) : part)
    return [{ path, message: value.message }]
  })
  const translated = translateRpcValidationIssues({ data: { issues: entries } })
  return translated.map(issue => ({ path: issue.path, message: issue.message }))
}

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
  const issueAt = (path: (string | number)[]) => issues.find(issue => issue.path.length === path.length && issue.path.every((part, index) => part === path[index]))
  const issueId = (path: (string | number)[]) => `earning-field-error-${path.join("-")}`
  const controlPath = (path: (string | number)[]) => {
    const [root, rowId, field] = path
    if (root === "periodStart" || root === "periodEnd" || root === "totalAmountText" || root === "unallocatedAmountText") return true
    return root === "rows" && rows.some(row => row.id === rowId) && ["projectId", "daysText", "amountText"].includes(String(field))
  }
  const clearIssue = (path: (string | number)[]) => {
    const changesMoneyTotal = path[0] === "totalAmountText" || path[0] === "unallocatedAmountText" ||
      (path[0] === "rows" && path[2] === "amountText")
    setIssues(current => current.filter(issue => {
      const samePath = issue.path.length === path.length && issue.path.every((part, index) => part === path[index])
      const staleConservation = changesMoneyTotal && issue.path.length === 1 && issue.path[0] === "totalAmountText" &&
        issue.message === t("workforce.validation.earning.conservation")
      return !samePath && !staleConservation
    }))
  }
  const globalIssues = issues.filter(issue => !controlPath(issue.path))

  const submit = async () => {
    setError("")
    setIssues([])
    if (!identity) { setError(t("earnings.identityRequired")); return }
    if (storageError) { setError(t("earnings.storageUnavailable")); return }
    let hadPriorPending = pending !== null
    let payload = pending?.payload
    let mutationStarted = false
    let mutationSucceeded = false
    try {
      if (!payload) {
        const loaded = loadPendingEmployeeEarning(identity, window.localStorage)
        if (!loaded.ok) { setStorageError(true); setError(t("earnings.storageUnavailable")); return }
        if (loaded.pending) {
          hadPriorPending = true
          payload = loaded.pending.payload
          setPending(loaded.pending)
        } else {
          const result = markEmployeeEarningPending(draft, identity, window.localStorage, () => crypto.randomUUID())
          if (!result.ok) {
            if (result.issue) { setStorageError(true); setError(t("earnings.storageUnavailable")); return }
            setIssues(result.issues.map(issue => ({ path: issue.path, message: t(issue.message) })))
            return
          }
          payload = result.payload
          setPending({ version: 1, identity, payload })
        }
      }
      mutationStarted = true
      await mutation.mutateAsync(payload)
      mutationSucceeded = true
      removePendingEmployeeEarning(identity, window.localStorage)
      setPending(null)
      setTotal("")
      setUnallocated("")
      setRows([])
      onOpenChange(false)
    } catch (cause) {
      if (mutationSucceeded || !mutationStarted) {
        setStorageError(true)
        setError(t("earnings.storageUnavailable"))
        return
      }
      const rpcIssues = translateRpcValidationIssues(cause)
      const serverIssues = [...appFieldIssues(cause), ...rpcIssues]
      const normalizedIssues = serverIssues.map(issue => ({ path: normalizeIssuePath(issue.path, rows), message: issue.message }))
      const code = typeof cause === "object" && cause !== null && "code" in cause ? String((cause as { code?: unknown }).code) : ""
      const wireValidation = code === "BAD_REQUEST" && hasKnownContractValidationIssues(cause)
      const isProvenNoWrite = !hadPriorPending && (code === "VALIDATION" || code === "NOT_FOUND" || wireValidation)
      if (isProvenNoWrite) {
        try {
          removePendingEmployeeEarning(identity, window.localStorage)
          setPending(null)
        } catch {
          setStorageError(true)
          setError(t("earnings.storageUnavailable"))
          setIssues(normalizedIssues)
          return
        }
      }
      setIssues(normalizedIssues)
      setError(normalizedIssues.length ? "" : cause instanceof Error ? cause.message : t("earnings.submitError"))
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
          {(["periodStart", "periodEnd"] as const).map(field => {
            const path = [field]
            const issue = issueAt(path)
            const value = field === "periodStart" ? periodStart : periodEnd
            const setValue = field === "periodStart" ? setPeriodStart : setPeriodEnd
            return <label key={field} className="flex flex-col gap-2" aria-invalid={issue ? true : undefined} aria-describedby={issue ? issueId(path) : undefined}>
              <span className="text-sm font-medium">{t(`earnings.${field}`)}</span>
              <DatePicker id={t(`earnings.${field}`)} aria-invalid={issue ? true : undefined} aria-describedby={issue ? issueId(path) : undefined} value={value} onChange={next => { clearIssue(path); setValue(next) }} disabled={frozen || busy} />
              {issue ? <p id={issueId(path)} className="text-sm text-destructive">{issue.message}</p> : null}
            </label>
          })}
          {(["totalAmountText", "unallocatedAmountText"] as const).map(field => {
            const path = [field]
            const issue = issueAt(path)
            const isTotal = field === "totalAmountText"
            const label = t(isTotal ? "earnings.total" : "earnings.unallocated")
            return <label key={field} className="flex flex-col gap-2">
              <span className="text-sm font-medium">{label}</span>
              <CurrencyInput aria-label={label} aria-invalid={issue ? true : undefined} aria-describedby={issue ? issueId(path) : undefined} value={isTotal ? total : unallocated} onChange={event => { clearIssue(path); (isTotal ? setTotal : setUnallocated)(event.target.value) }} disabled={frozen || busy} />
              {issue ? <p id={issueId(path)} className="text-sm text-destructive">{issue.message}</p> : null}
            </label>
          })}
        </div>
        <section className="space-y-3 rounded-xl border border-border/60 bg-surface-2 p-4" aria-label={t("earnings.projectRows")}>
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{t("earnings.projectRows")}</h3><Button type="button" size="xs" variant="outline" onClick={addRow} disabled={frozen || busy}>{t("earnings.addProjectRow")}</Button></div>
          {rows.map((row, index) => {
            const projectPath = ["rows", row.id, "projectId"]
            const daysPath = ["rows", row.id, "daysText"]
            const amountPath = ["rows", row.id, "amountText"]
            const projectIssue = issueAt(projectPath)
            const daysIssue = issueAt(daysPath)
            const amountIssue = issueAt(amountPath)
            return <div key={row.id} className="grid gap-3 sm:grid-cols-[1fr_100px_140px_auto] sm:items-end">
              <label className="flex flex-col gap-1"><span className="text-xs text-ink-3">{t("earnings.project")}</span><NativeSelect aria-label={`${t("earnings.project")} ${index + 1}`} aria-invalid={projectIssue ? true : undefined} aria-describedby={projectIssue ? issueId(projectPath) : undefined} value={row.projectId} disabled={frozen || busy} onChange={event => { clearIssue(projectPath); updateRow(row.id, { projectId: event.target.value }) }}><option value="">{t("earnings.selectProject")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect>{projectIssue ? <p id={issueId(projectPath)} className="text-sm text-destructive">{projectIssue.message}</p> : null}</label>
              <label className="flex flex-col gap-1"><span className="text-xs text-ink-3">{t("earnings.days")}</span><Input aria-label={`${t("earnings.days")} ${index + 1}`} aria-invalid={daysIssue ? true : undefined} aria-describedby={daysIssue ? issueId(daysPath) : undefined} type="number" min={1} step={1} inputMode="numeric" dir="ltr" value={row.daysText} disabled={frozen || busy} onChange={event => { clearIssue(daysPath); updateRow(row.id, { daysText: event.target.value }) }} />{daysIssue ? <p id={issueId(daysPath)} className="text-sm text-destructive">{daysIssue.message}</p> : null}</label>
              <label className="flex flex-col gap-1"><span className="text-xs text-ink-3">{t("earnings.amount")}</span><CurrencyInput aria-label={`${t("earnings.amount")} ${index + 1}`} aria-invalid={amountIssue ? true : undefined} aria-describedby={amountIssue ? issueId(amountPath) : undefined} value={row.amountText} disabled={frozen || busy} onChange={event => { clearIssue(amountPath); updateRow(row.id, { amountText: event.target.value }) }} />{amountIssue ? <p id={issueId(amountPath)} className="text-sm text-destructive">{amountIssue.message}</p> : null}</label>
              <Button type="button" size="xs" variant="ghost" onClick={() => removeRow(row.id)} disabled={frozen || busy}>{t("earnings.removeProjectRow", { number: index + 1 })}</Button>
            </div>
          })}
        </section>
        {globalIssues.length ? <div role="alert" className="space-y-1 text-sm text-destructive">{globalIssues.map((issue, index) => <p key={`${issue.path.join(".")}-${index}`}>{issue.message}</p>)}</div> : null}
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
