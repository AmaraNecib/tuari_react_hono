import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { ORPCError } from "@orpc/client"
import { Money } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { AppDate } from "@/components/app-date"
import { DatePicker } from "@/components/ui/date-picker"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { MoneyValue } from "@/features/shared/money-value"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"
import { useSessionQuery } from "@/features/session/use-session-query"
import { resolveApiBaseUrl } from "@/lib/runtime-config"
import { useEmployeeOpeningQuery, useReviewEmployeeOpeningMutation, useCorrectEmployeeOpeningMutation, useReconcileEmployeeOpeningMutation, useCancelEmployeeOpeningProposalMutation } from "./employee-earnings-queries"
import { clearPayrollPendingIntent, createPayrollRequestId, getPayrollStorage, loadPayrollPendingIntent, markPayrollIntentAttempt, savePayrollPendingIntent, withPayrollIntentLock, type PayrollIdentity, type PayrollPendingIntent } from "./payroll-pending-intent"

type OpeningIntent = PayrollPendingIntent<"opening-review" | "opening-correct" | "opening-reconcile" | "opening-cancel">
const actions = ["opening-review", "opening-correct", "opening-reconcile", "opening-cancel"] as const
const exact = (value: string) => {
  const result = parseLocalizedMoneyInput(value)
  if (result.compare(Money.parse("0")) < 0) throw new Error("Invalid opening amount")
  return result.toWire()
}

export function EmployeeOpeningPanel({ employeeId }: { employeeId: string }) {
  const session = useSessionQuery()
  const userId = session.data?.user?.id
  const workspaceId = useMemo(() => { try { return resolveApiBaseUrl() } catch { return null } }, [])
  const identity = useMemo(() => userId && workspaceId ? { employeeId, userId, workspaceId } : null, [employeeId, userId, workspaceId])
  if (!identity) return null
  return <OpeningEditor key={JSON.stringify(identity)} identity={identity} />
}

function OpeningEditor({ identity }: { identity: PayrollIdentity }) {
  const { t } = useTranslation()
  const query = useEmployeeOpeningQuery(identity.employeeId)
  const reviewMutation = useReviewEmployeeOpeningMutation()
  const correctMutation = useCorrectEmployeeOpeningMutation()
  const reconcileMutation = useReconcileEmployeeOpeningMutation()
  const cancelMutation = useCancelEmployeeOpeningProposalMutation()
  const [cashConfirmedProposalId, setCashConfirmedProposalId] = useState<string | null>(null)
  const [refundDate, setRefundDate] = useState(getAlgeriaDateInputValue())
  const [kind, setKind] = useState<"WAGE" | "ADVANCE">("WAGE")
  const [wages, setWages] = useState("0")
  const [advances, setAdvances] = useState("0")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<OpeningIntent | null>(null)
  const [pending, setPending] = useState<OpeningIntent | null>(null)
  const [refusedAttempt, setRefusedAttempt] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [dispatching, setDispatching] = useState(false)
  const alive = useRef(true)
  const data = query.data
  const busy = dispatching || reviewMutation.isPending || correctMutation.isPending || reconcileMutation.isPending || cancelMutation.isPending

  const load = useCallback(() => {
    try {
      const storage = getPayrollStorage()
      if (!storage) throw new Error("Missing storage")
      const results = actions.map(action => loadPayrollPendingIntent(action, identity, storage))
      if (results.some(result => !result.ok)) throw new Error("Invalid stored intent")
      const saved = results.flatMap(result => result.ok && result.pending ? [result.pending] : [])
      if (saved.length > 1) throw new Error("Conflicting opening intents")
      setPending(saved[0] ?? null)
      setRefusedAttempt(null)
      setPreview(null)
      setCashConfirmedProposalId(null)
      setStorageError(false)
      setReady(true)
    } catch { setStorageError(true); setReady(false) }
  }, [identity])

  useEffect(() => {
    alive.current = true
    load()
    window.addEventListener("storage", load)
    return () => { alive.current = false; window.removeEventListener("storage", load) }
  }, [load])

  async function send(intent: OpeningIntent) {
    const storage = getPayrollStorage()
    if (!storage || !alive.current) throw new Error("Missing storage")
    const current = loadPayrollPendingIntent(intent.action, identity, storage)
    if (!current.ok || current.pending?.payload.requestId !== intent.payload.requestId) throw new Error("Opening intent changed")
    const attempted = markPayrollIntentAttempt(current.pending, storage)
    setPending(attempted)
    setRefusedAttempt(null)
    try {
      if (attempted.action === "opening-review") await reviewMutation.mutateAsync(attempted.payload)
      else if (attempted.action === "opening-correct") await correctMutation.mutateAsync(attempted.payload)
      else if (attempted.action === "opening-reconcile") await reconcileMutation.mutateAsync(attempted.payload)
      else await cancelMutation.mutateAsync(attempted.payload)
      if (!clearPayrollPendingIntent(attempted.action, identity, attempted.payload.requestId, storage)) {
        if (alive.current) { load(); setError(""); void query.refetch() }
        return
      }
      if (alive.current) { setPending(null); setError(""); setAmount(""); setReason(""); setCashConfirmedProposalId(null) }
    } catch (cause) {
      if (!alive.current) return
      if (cause instanceof ORPCError && ["BAD_REQUEST", "NOT_FOUND", "CONFLICT"].includes(cause.code) && cause.data?.payrollOutcome === "NOT_COMMITTED") setRefusedAttempt(attempted.attemptId ?? null)
      setError(t("employeeOpening.error"))
    }
  }

  async function dispatch(intent: OpeningIntent, fresh: boolean) {
    setDispatching(true)
    try {
      await withPayrollIntentLock(identity, async () => {
        if (!alive.current) return
        if (fresh) {
          const storage = getPayrollStorage()
          if (!storage) throw new Error("Missing storage")
          const results = actions.map(action => loadPayrollPendingIntent(action, identity, storage))
          if (results.some(result => !result.ok || result.pending !== null)) throw new Error("An opening request is pending")
          const saved = savePayrollPendingIntent(intent.action, identity, intent.payload, storage)
          setPending(saved)
          setPreview(null)
          await send(saved)
        } else {
          const storage = getPayrollStorage()
          if (!storage) throw new Error("Missing storage")
          const current = loadPayrollPendingIntent(intent.action, identity, storage)
          if (!current.ok || !current.pending || current.pending.payload.requestId !== intent.payload.requestId) {
            load(); setError("")
            await query.refetch()
            return
          }
          await send(current.pending)
        }
      })
    } catch { if (alive.current) setStorageError(true) }
    finally { if (alive.current) setDispatching(false) }
  }

  async function discardRefused() {
    if (!pending || !refusedAttempt) return
    try {
      await withPayrollIntentLock(identity, async () => {
        if (!alive.current) return
        const storage = getPayrollStorage()
        if (!storage) throw new Error("Missing storage")
        const current = loadPayrollPendingIntent(pending.action, identity, storage)
        if (!current.ok || current.pending?.attemptId !== refusedAttempt || current.pending.payload.requestId !== pending.payload.requestId) throw new Error("A newer attempt exists")
        if (!clearPayrollPendingIntent(pending.action, identity, pending.payload.requestId, storage)) throw new Error("Stored intent changed")
        setPending(null); setRefusedAttempt(null); setError(""); setPreview(null)
        await query.refetch()
      })
    } catch { setStorageError(true) }
  }

  function prepare(event: FormEvent) {
    event.preventDefault()
    if (!data || pending || busy || !ready) return
    try {
      const common = { requestId: createPayrollRequestId(), employeeId: identity.employeeId }
      const intent: OpeningIntent = data.review === "UNREVIEWED"
        ? { version: 1, action: "opening-review", identity, payload: { ...common, wages: exact(wages), advances: exact(advances) } }
        : { version: 1, action: "opening-correct", identity, payload: { ...common, kind, expectedAmount: (kind === "WAGE" ? data.wages : data.advances) ?? "0.00", amount: exact(amount), reason: reason.trim() } }
      if (intent.action === "opening-correct" && (!intent.payload.reason || intent.payload.reason.length > 1000 || intent.payload.amount === intent.payload.expectedAmount)) throw new Error("Invalid correction")
      setPreview(intent); setError("")
    } catch { setError(t("employeeOpening.invalid")) }
  }

  function prepareProposal(proposalId: string, cancel = false) {
    if (!data || pending || busy || !ready) return
    const proposal = data.proposals.find(row => row.id === proposalId && row.status === "PENDING")
    if (!proposal) return
    try {
      const common = { requestId: createPayrollRequestId(), employeeId: identity.employeeId, proposalId }
      if (cancel) {
        if (!reason.trim()) throw new Error("Missing reason")
        setPreview({ version: 1, action: "opening-cancel", identity, payload: { ...common, reason: reason.trim() } })
      } else {
        const date = toAlgeriaDayBoundaryIso(refundDate, "start")
        if (!date || cashConfirmedProposalId !== proposal.id) throw new Error("Actual cash confirmation required")
        setPreview({ version: 1, action: "opening-reconcile", identity, payload: { ...common, expectedAmount: proposal.oldAmount, refundAmount: proposal.requiredRefund, refundDate: date, confirmCashRefund: true } })
      }
      setError("")
    } catch { setError(t("employeeOpening.invalid")) }
  }
  const confirmLabel = (intent: OpeningIntent) => t(intent.action === "opening-review" ? "employeeOpening.confirmReview" : intent.action === "opening-correct" ? "employeeOpening.confirmCorrect" : intent.action === "opening-reconcile" ? "employeeOpening.confirmRefund" : "employeeOpening.confirmCancel")

  return <section aria-label={t("employeeOpening.title")} className="employee-opening min-w-0 space-y-4">
    <h3 className="text-base font-semibold">{t("employeeOpening.title")}</h3>
    {storageError ? <p role="alert">{t("employeeOpening.storage")}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {pending ? <div className="space-y-3" role="status">
      <p>{t(refusedAttempt ? "employeeOpening.refused" : "employeeOpening.uncertain")}</p>
      <Button type="button" disabled={busy || storageError} onClick={() => void dispatch(pending, false)}>{t("employeeOpening.retry")}</Button>
      {refusedAttempt ? <Button type="button" variant="outline" disabled={busy} onClick={() => void discardRefused()}>{t("employeeOpening.cancel")}</Button> : null}
    </div> : query.isError ? <p role="alert">{t("employeeOpening.error")}</p> : data ? <>
      <p className="text-sm text-muted-foreground">{t(data.review === "UNREVIEWED" ? "employeeOpening.unknown" : "employeeOpening.settled")}</p>
      {data.proposals.some(proposal => proposal.status === "PENDING") ? <div className="space-y-4"><h4 className="font-medium">{t("employeeOpening.proposals")}</h4>{data.proposals.filter(proposal => proposal.status === "PENDING").map(proposal => <div key={proposal.id} className="space-y-3">
        <p>{t("employeeOpening.pendingProposal")}</p><p><bdi>{proposal.oldAmount}</bdi> ← <bdi>{proposal.newAmount}</bdi> · {proposal.reason}</p>
        <p>{t(proposal.kind === "WAGE" ? "employeeOpening.refundIn" : "employeeOpening.refundOut")}: <MoneyValue exact value={proposal.requiredRefund} currencyLabel={t("detailPages.salary.currency")} /></p>
        <label>{t("employeeOpening.refundDate")}<DatePicker value={refundDate} onChange={setRefundDate} disabled={busy || preview !== null} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cashConfirmedProposalId === proposal.id} onChange={event => setCashConfirmedProposalId(event.target.checked ? proposal.id : null)} disabled={busy || preview !== null} />{t("employeeOpening.confirmActualCash")}</label>
        <Button type="button" disabled={busy || preview !== null || cashConfirmedProposalId !== proposal.id || !ready || storageError} onClick={() => prepareProposal(proposal.id)}>{t("employeeOpening.prepareRefund")}</Button>
        <label className="block">{t("employeeOpening.cancelReason")}<Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} disabled={busy || preview !== null} /></label>
        <Button type="button" variant="outline" disabled={busy || preview !== null || !reason.trim() || !ready || storageError} onClick={() => prepareProposal(proposal.id, true)}>{t("employeeOpening.cancelProposal")}</Button>
      </div>)}</div> : null}
      <form onSubmit={prepare} className="max-w-3xl space-y-4">
        <fieldset disabled={busy || !ready || storageError || preview !== null} className="grid min-w-0 gap-3 [&>label]:min-w-0 sm:grid-cols-2">
          {data.review === "UNREVIEWED" ? <>
            <label>{t("employeeOpening.wages")}<CurrencyInput aria-label={t("employeeOpening.wages")} value={wages} onChange={event => setWages(event.target.value)} /></label>
            <label>{t("employeeOpening.advances")}<CurrencyInput aria-label={t("employeeOpening.advances")} value={advances} onChange={event => setAdvances(event.target.value)} /></label>
          </> : <>
            <label>{t("employeeOpening.kind")}<NativeSelect value={kind} aria-label={t("employeeOpening.kind")} onChange={event => setKind(event.target.value as "WAGE" | "ADVANCE")}><option value="WAGE">{t("employeeOpening.wages")}</option><option value="ADVANCE">{t("employeeOpening.advances")}</option></NativeSelect></label>
            <label>{t("employeeOpening.amount")}<CurrencyInput aria-label={t("employeeOpening.amount")} value={amount} onChange={event => setAmount(event.target.value)} /></label>
            <label className="sm:col-span-2">{t("employeeOpening.reason")}<Textarea aria-label={t("employeeOpening.reason")} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          </>}
        </fieldset>
        {!preview ? <Button type="submit" disabled={busy || !ready || storageError}>{t(data.review === "UNREVIEWED" ? "employeeOpening.review" : "employeeOpening.correct")}</Button> : null}
      </form>
      {preview ? <div className="space-y-3 rounded-lg border border-border p-3" role="group" aria-label={t("employeeOpening.correct")}>
        {preview.action === "opening-correct" ? <>
          <dl className="grid grid-cols-2 gap-2"><dt>{t("employeeOpening.previous")}</dt><dd><bdi>{preview.payload.expectedAmount}</bdi></dd><dt>{t("employeeOpening.next")}</dt><dd><bdi>{preview.payload.amount}</bdi></dd></dl>
          {Money.parse(preview.payload.amount).compare(Money.parse(preview.payload.expectedAmount)) < 0 ? <p>{t("employeeOpening.decrease", { amount: Money.parse(preview.payload.expectedAmount).subtract(Money.parse(preview.payload.amount)).toWire() })}</p> : null}
          <p>{preview.payload.reason}</p>
        </> : preview.action === "opening-review" ? <dl><dt>{t("employeeOpening.wages")}</dt><dd><bdi>{preview.payload.wages}</bdi></dd><dt>{t("employeeOpening.advances")}</dt><dd><bdi>{preview.payload.advances}</bdi></dd></dl> : preview.action === "opening-reconcile" ? <p>{t("employeeOpening.refundAmount")}: <bdi>{preview.payload.refundAmount}</bdi> · {t("employeeOpening.confirmActualCash")}</p> : <p>{preview.payload.reason}</p>}
        <p className="text-sm">{t("employeeOpening.unchangedHistory")}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || storageError} onClick={() => void dispatch(preview, true)}>{confirmLabel(preview)}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)}>{t("employeeOpening.cancel")}</Button></div>
      </div> : null}
    </> : null}
    {data?.proposals.filter(proposal => proposal.status !== "PENDING").map(proposal => <p key={proposal.id} className="text-sm">{t(proposal.status === "APPLIED" ? "employeeOpening.appliedProposal" : "employeeOpening.cancelledProposal")}: <bdi>{proposal.oldAmount}</bdi> ← <bdi>{proposal.newAmount}</bdi> · {proposal.resolution?.reason}</p>)}
    {data?.refunds.length ? <div className="space-y-2 text-sm"><h4 className="font-medium">{t("employeeOpening.refundHistory")}</h4>{data.refunds.map(refund => <p key={refund.id}>{t(refund.direction === "IN" ? "employeeOpening.refundIn" : "employeeOpening.refundOut")}: <MoneyValue exact value={refund.amount} currencyLabel={t("detailPages.salary.currency")} /> · <AppDate value={refund.refundDate} /> · <bdi>{refund.actorLabel ?? refund.actorUserId ?? t("employeeOpening.unknownActor")}</bdi></p>)}</div> : null}
    {data?.reviewAudit ? <details className="text-sm"><summary>{t("employeeOpening.original")}</summary><dl className="grid gap-2 py-3 sm:grid-cols-2"><dt>{t("employeeOpening.wages")}</dt><dd><MoneyValue exact value={data.reviewAudit.wages} currencyLabel={t("detailPages.salary.currency")} /></dd><dt>{t("employeeOpening.advances")}</dt><dd><MoneyValue exact value={data.reviewAudit.advances} currencyLabel={t("detailPages.salary.currency")} /></dd></dl><p><bdi>{data.reviewAudit.actorLabel ?? data.reviewAudit.actorUserId ?? t("employeeOpening.unknownActor")}</bdi> · <AppDate value={data.reviewAudit.createdAt} /></p></details> : null}
    {data ? <div className="space-y-2"><h4 className="font-medium">{t("employeeOpening.history")}</h4>{data.history.length === 0 ? <p className="text-sm text-muted-foreground">{t("employeeOpening.noHistory")}</p> : <ol className="divide-y divide-border">{data.history.map(event => <li key={event.id} className="space-y-1 break-words py-3 text-sm">
      <p>{t(event.kind === "WAGE" ? "employeeOpening.wages" : "employeeOpening.advances")}: <MoneyValue exact value={event.oldAmount} currencyLabel={t("detailPages.salary.currency")} /> ← <MoneyValue exact value={event.newAmount} currencyLabel={t("detailPages.salary.currency")} /></p>
      <p>{event.reason}</p><p>{event.actorLabel ?? event.actorUserId ?? t("employeeOpening.unknownActor")} · <AppDate value={event.createdAt} /></p>
      {event.status === "VOIDED" ? <p>{t("employeeOpening.voided")}: {event.voidReason}</p> : null}
    </li>)}</ol>}</div> : null}
  </section>
}
