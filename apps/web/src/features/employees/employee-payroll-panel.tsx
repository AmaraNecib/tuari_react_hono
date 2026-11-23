import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { ORPCError } from "@orpc/client"
import type { EmployeePayrollAdvanceOffsetInput, EmployeePayrollAdvanceRepayInput, EmployeePayrollCashRecordInput } from "@tuari/contracts"

import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, NativeSelect } from "@/components/ui/form-controls"
import { MoneyValue } from "@/features/shared/money-value"
import { useSessionQuery } from "@/features/session/use-session-query"
import { resolveApiBaseUrl } from "@/lib/runtime-config"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import {
  useEmployeePayrollQuery,
  useEmployeeOpeningQuery,
  useOffsetEmployeePayrollAdvanceMutation,
  useRecordEmployeePayrollCashMutation,
  useRepayEmployeePayrollAdvanceMutation,
} from "./employee-earnings-queries"
import {
  clearPayrollPendingIntent,
  createPayrollRequestId,
  getPayrollStorage,
  loadPayrollPendingIntent,
  markPayrollIntentAttempt,
  savePayrollPendingIntent,
  withPayrollIntentLock,
  type PayrollAction,
  type PayrollIdentity,
  type PayrollPendingIntent,
} from "./payroll-pending-intent"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"
import { EmployeeOpeningPanel } from "./employee-opening-panel"
import { paymentFromPercentage, paymentPercentage, previewPayrollPayment } from "./payroll-percentage"

const ZERO = "0.00"
const PAYROLL_ACTIONS: PayrollAction[] = ["cash", "repay", "offset"]
const minor = (amount: string) => BigInt(parseLocalizedMoneyInput(amount).toMinorUnits())
const wire = (amount: bigint) => `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`
const aggregateMoney = (amount: string) => {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(amount)
  if (!match) throw new TypeError("Invalid payroll aggregate")
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`
}

function visibleError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code
  return "SERVICE_UNAVAILABLE"
}

export function EmployeePayrollPanel({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation()
  const session = useSessionQuery()
  const userId = session.data?.user?.id ?? null
  const workspaceId = useMemo(() => { try { return resolveApiBaseUrl() } catch { return null } }, [])
  const identity = useMemo<PayrollIdentity | null>(() => userId && workspaceId
    ? { userId, workspaceId, employeeId }
    : null, [userId, workspaceId, employeeId])
  const payroll = useEmployeePayrollQuery(employeeId)
  const openingQuery = useEmployeeOpeningQuery(employeeId)
  const cashMutation = useRecordEmployeePayrollCashMutation()
  const repayMutation = useRepayEmployeePayrollAdvanceMutation()
  const offsetMutation = useOffsetEmployeePayrollAdvanceMutation()
  const [action, setAction] = useState<PayrollAction>("cash")
  const [pending, setPending] = useState<PayrollPendingIntent | null>(null)
  const [refusedAttemptId, setRefusedAttemptId] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [storageRevision, setStorageRevision] = useState(0)
  const [error, setError] = useState("")
  const [earningId, setEarningId] = useState("")
  const [advanceId, setAdvanceId] = useState("")
  const [amount, setAmount] = useState("")
  const [percentageDraft, setPercentageDraft] = useState<string | null>(null)
  const [advanceAmount, setAdvanceAmount] = useState("")
  const [date, setDate] = useState(getAlgeriaDateInputValue())
  const locked = pending !== null
  const identityKey = identity ? JSON.stringify(identity) : null
  const identityKeyRef = useRef(identityKey)
  identityKeyRef.current = identityKey
  const busy = cashMutation.isPending || repayMutation.isPending || offsetMutation.isPending
  const data = payroll.data
  const currencyLabel = t("detailPages.salary.currency")
  const earnings = data?.earnings ?? []
  const availableEarnings = earnings.filter(item => minor(item.remaining) > 0n)
  const advances = data?.advances ?? []
  const availableAdvances = advances.filter(item => minor(item.remaining) > 0n)
  const openingWage = action === "cash" ? openingQuery.data?.sources.find(source => source.kind === "WAGE" && minor(source.remaining) > 0n) : undefined
  const openingAdvance = action === "repay" ? openingQuery.data?.sources.find(source => source.kind === "ADVANCE" && minor(source.remaining) > 0n) : undefined

  useEffect(() => {
    const refresh = () => setStorageRevision(value => value + 1)
    window.addEventListener("storage", refresh)
    return () => window.removeEventListener("storage", refresh)
  }, [])

  const draftEmployeeId = useRef(employeeId)
  useEffect(() => {
    if (draftEmployeeId.current === employeeId) return
    draftEmployeeId.current = employeeId
    setEarningId("")
    setAdvanceId("")
    setAmount("")
    setPercentageDraft(null)
    setAdvanceAmount("")
    setError("")
    setAction("cash")
    setDate(getAlgeriaDateInputValue())
  }, [employeeId])

  useEffect(() => {
    setRefusedAttemptId(null)
    if (!identity) {
      setPending(null)
      setStorageError(false)
      return
    }
    const storage = getPayrollStorage()
    if (!storage) {
      setStorageError(true)
      return
    }
    try {
      const loaded = PAYROLL_ACTIONS.map(candidate => loadPayrollPendingIntent(candidate, identity, storage))
      if (loaded.some(result => !result.ok)) {
        setPending(null)
        setStorageError(true)
      } else {
        const pendingIntents = loaded.flatMap(result => result.ok && result.pending ? [result.pending] : [])
        if (pendingIntents.length > 1) {
          setPending(null)
          setStorageError(true)
        } else {
          setStorageError(false)
          const intent = pendingIntents[0] ?? null
          if (intent) setAction(intent.action)
          setPending(intent)
        }
      }
    } catch {
      setPending(null)
      setStorageError(true)
    }
    setError("")
  }, [identity, storageRevision])

  useEffect(() => {
    if (!locked || typeof window === "undefined") return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [locked])

  useEffect(() => {
    if (!availableEarnings.some(item => item.earning.id === earningId) && !(openingWage && earningId === `opening:${openingWage.sourceId}`)) {
      const nextEarningId = availableEarnings[0]?.earning.id ?? (openingWage ? `opening:${openingWage.sourceId}` : "")
      if (nextEarningId !== earningId) {
        setEarningId(nextEarningId)
        if (!locked && action !== "repay") {
          setAmount("")
          setPercentageDraft(null)
          setError("")
        }
      }
    }
    if (!availableAdvances.some(item => item.advance.id === advanceId) && !(openingAdvance && advanceId === `opening:${openingAdvance.sourceId}`)) setAdvanceId(availableAdvances[0]?.advance.id ?? (openingAdvance ? `opening:${openingAdvance.sourceId}` : ""))
  }, [earningId, advanceId, availableEarnings, availableAdvances, openingWage, openingAdvance, locked, action])

  const selectedEarning = earnings.find(item => item.earning.id === earningId)
  const selectedAdvance = advances.find(item => item.advance.id === advanceId)
  const selectedOpeningWage = openingWage && earningId === `opening:${openingWage.sourceId}` ? openingWage : undefined
  const selectedOpeningAdvance = openingAdvance && advanceId === `opening:${openingAdvance.sourceId}` ? openingAdvance : undefined

  const percentageBasis = action === "cash" ? selectedEarning?.earning.totalAmount : undefined
  let percentageDisplay = ""
  let percentageApproximate = false
  let previewError = ""
  let paymentPreview: ReturnType<typeof previewPayrollPayment> | null = null
  let cumulativeCashPercentage: ReturnType<typeof paymentPercentage> | null = null
  if (percentageBasis && selectedEarning && !locked) {
    try {
      const display = paymentPercentage(amount || ZERO, percentageBasis)
      percentageDisplay = display.value
      percentageApproximate = display.approximate
      paymentPreview = previewPayrollPayment(percentageBasis, selectedEarning.remaining, amount)
      const previouslyPaid = (data?.cash ?? []).flatMap(record => record.wageAllocations)
        .filter(allocation => allocation.source.kind === "EARNING" && allocation.source.id === selectedEarning.earning.id)
        .reduce((sum, allocation) => sum + minor(allocation.amount), 0n)
      cumulativeCashPercentage = paymentPercentage(wire(previouslyPaid + minor(paymentPreview.amount)), percentageBasis)
    } catch {
      try {
        if (minor(amount) > minor(selectedEarning.remaining)) previewError = "AMOUNT_EXCEEDS_BALANCE"
      } catch { /* Incomplete drafts have no valid preview. */ }
    }
  }
  function editPercentage(value: string) {
    setPercentageDraft(value)
    try {
      if (!percentageBasis) throw new TypeError("EARNING_REQUIRED")
      setAmount(paymentFromPercentage(percentageBasis, value))
      setError("")
    } catch {
      setAmount("")
      setError("INVALID_PERCENTAGE")
    }
  }

  async function sendIntent(intent: PayrollPendingIntent) {
    setRefusedAttemptId(null)
    setError("")
    try {
      const attemptStorage = getPayrollStorage()
      if (!attemptStorage) throw new Error("STORAGE_UNAVAILABLE")
      intent = markPayrollIntentAttempt(intent, attemptStorage)
      if (identityKeyRef.current === JSON.stringify(intent.identity)) setPending(intent)
      if (intent.action === "cash") await cashMutation.mutateAsync(intent.payload as EmployeePayrollCashRecordInput)
      else if (intent.action === "repay") await repayMutation.mutateAsync(intent.payload as EmployeePayrollAdvanceRepayInput)
      else await offsetMutation.mutateAsync(intent.payload as EmployeePayrollAdvanceOffsetInput)
      const storage = getPayrollStorage()
      if (!storage || !clearPayrollPendingIntent(intent.action, intent.identity, intent.payload.requestId, storage)) {
        setStorageError(true)
        setError("STORAGE_UNAVAILABLE")
        return
      }
      if (identityKeyRef.current === JSON.stringify(intent.identity)) {
        setPending(current => current?.payload.requestId === intent.payload.requestId ? null : current)
        setAmount("")
        setPercentageDraft(null)
        setAdvanceAmount("")
        setError("")
      }
    } catch (cause) {
      if (identityKeyRef.current === JSON.stringify(intent.identity) && cause instanceof ORPCError &&
        ["BAD_REQUEST", "NOT_FOUND", "CONFLICT"].includes(cause.code) &&
        cause.data?.payrollOutcome === "NOT_COMMITTED") {
        setRefusedAttemptId(intent.attemptId ?? null)
        setError(visibleError(cause))
        return "refused" as const
      }
      // The server may have committed before the response was lost. Keep this
      // exact request frozen so retry uses the same id and payload.
      setError(visibleError(cause))
    }
  }

  async function discardRefusedIntent(intent: PayrollPendingIntent) {
    try {
      await withPayrollIntentLock(intent.identity, async () => {
        if (identityKeyRef.current !== JSON.stringify(intent.identity) || refusedAttemptId !== intent.attemptId) return
        const storage = getPayrollStorage()
        if (!storage) throw new Error("STORAGE_UNAVAILABLE")
        const current = loadPayrollPendingIntent(intent.action, intent.identity, storage)
        if (!current.ok || current.pending?.payload.requestId !== intent.payload.requestId) { setStorageRevision(value => value + 1); return }
        // A refusal authorizes discarding only its own dispatch attempt.
        if (current.pending.attemptId !== refusedAttemptId) { setStorageRevision(value => value + 1); return }
        if (!clearPayrollPendingIntent(intent.action, intent.identity, intent.payload.requestId, storage)) throw new Error("STORAGE_UNAVAILABLE")
        setPending(null)
        setRefusedAttemptId(null)
        setAmount("")
        setPercentageDraft(null)
        setAdvanceAmount("")
        setError("")
        await payroll.refetch()
      })
    } catch { setStorageError(true) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!identity) return
    const submittedIdentity = JSON.stringify(identity)
    void withPayrollIntentLock(identity, async () => {
      if (identityKeyRef.current !== submittedIdentity) return
      await prepareAndSend()
    }).catch(() => setStorageError(true))
  }

  async function retryIntent(intent: PayrollPendingIntent) {
    try {
      await withPayrollIntentLock(intent.identity, async () => {
        if (identityKeyRef.current !== JSON.stringify(intent.identity)) return
        const storage = getPayrollStorage()
        if (!storage) throw new Error("STORAGE_UNAVAILABLE")
        const current = loadPayrollPendingIntent(intent.action, intent.identity, storage)
        if (!current.ok) throw new Error("STORAGE_UNAVAILABLE")
        if (current.pending?.payload.requestId !== intent.payload.requestId) {
          setStorageRevision(value => value + 1)
          return
        }
        await sendIntent(current.pending)
      })
    } catch { setStorageError(true) }
  }

  async function prepareAndSend() {
    if (!identity || !data || locked || storageError) return
    if (percentageBasis && percentageDraft !== null && !paymentPreview) { setError(previewError || "INVALID_PERCENTAGE"); return }
    const storage = getPayrollStorage()
    if (!storage) { setStorageError(true); return }
    try {
      const storedIntents = PAYROLL_ACTIONS.map(candidate => loadPayrollPendingIntent(candidate, identity, storage))
      if (storedIntents.some(result => !result.ok)) { setStorageError(true); return }
      const existing = storedIntents.flatMap(result => result.ok && result.pending ? [result.pending] : [])
      if (existing.length) {
        setAction(existing[0]!.action)
        setPending(existing[0]!)
        return
      }
    } catch {
      setStorageError(true)
      return
    }
    const timestamp = toAlgeriaDayBoundaryIso(date, "start")
    if (!timestamp) { setError("INVALID_DATE"); return }
    try {
      let intent: PayrollPendingIntent
      if (action === "cash") {
        const wageAmount = amount.trim() ? parseLocalizedMoneyInput(amount).toWire() : ZERO
        const wageMinor = minor(wageAmount)
        if (wageMinor < 0n || (wageMinor > 0n && (!(selectedEarning || selectedOpeningWage) || wageMinor > minor((selectedOpeningWage ?? selectedEarning)!.remaining)))) throw new TypeError("AMOUNT_EXCEEDS_BALANCE")
        const extra = advanceAmount.trim() ? parseLocalizedMoneyInput(advanceAmount).toWire() : ZERO
        const extraMinor = minor(extra)
        if (extraMinor < 0n || wageMinor + extraMinor <= 0n) throw new TypeError("INVALID_AMOUNT")
        const payload: EmployeePayrollCashRecordInput = {
          requestId: createPayrollRequestId(), employeeId,
          amount: wire(wageMinor + extraMinor), paymentDate: timestamp,
          wages: wageMinor > 0n ? selectedOpeningWage ? [{ openingId: selectedOpeningWage.sourceId, amount: wageAmount }] : selectedEarning ? [{ earningId: selectedEarning.earning.id, amount: wageAmount }] : [] : [],
          ...(extraMinor > 0n ? { advanceAmount: extra } : {}),
        }
        intent = savePayrollPendingIntent("cash", identity, payload, storage)
      } else if (action === "repay") {
        if (!selectedAdvance && !selectedOpeningAdvance) throw new TypeError("ADVANCE_REQUIRED")
        const repayment = parseLocalizedMoneyInput(amount).toWire()
        if (minor(repayment) <= 0n || minor(repayment) > minor((selectedOpeningAdvance ?? selectedAdvance)!.remaining)) throw new TypeError("AMOUNT_EXCEEDS_BALANCE")
        const payload: EmployeePayrollAdvanceRepayInput = {
          requestId: createPayrollRequestId(), employeeId, ...(selectedOpeningAdvance ? { openingAdvanceId: selectedOpeningAdvance.sourceId } : { advanceId: selectedAdvance!.advance.id }), amount: repayment, paymentDate: timestamp,
        }
        intent = savePayrollPendingIntent("repay", identity, payload, storage)
      } else {
        if (!selectedEarning || !selectedAdvance) throw new TypeError("SOURCE_REQUIRED")
        const offsetAmount = parseLocalizedMoneyInput(amount).toWire()
        if (minor(offsetAmount) <= 0n || minor(offsetAmount) > minor(selectedEarning.remaining) || minor(offsetAmount) > minor(selectedAdvance.remaining)) throw new TypeError("AMOUNT_EXCEEDS_BALANCE")
        const payload: EmployeePayrollAdvanceOffsetInput = {
          requestId: createPayrollRequestId(), employeeId,
          wageSource: { kind: "EARNING", id: selectedEarning.earning.id },
          advanceSource: { kind: "ADVANCE", id: selectedAdvance.advance.id },
          amount: offsetAmount, settlementDate: timestamp,
        }
        intent = savePayrollPendingIntent("offset", identity, payload, storage)
      }
      setPending(intent)
      await sendIntent(intent)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "INVALID_AMOUNT")
    }
  }

  const currentError = error || previewError || (storageError ? "STORAGE_UNAVAILABLE" : "")
  const pendingWageAmount = pending?.action === "cash"
    ? wire(pending.payload.wages.reduce((sum, allocation) => sum + minor(allocation.amount), 0n))
    : null

  return (
    <section className="employee-payroll space-y-4" aria-labelledby={`payroll-heading-${employeeId}`} dir="rtl">
      <div>
        <h3 id={`payroll-heading-${employeeId}`} className="text-lg font-semibold text-foreground">{t("payroll.title")}</h3>

      </div>
      {data?.opening.reminder ? <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{t("payroll.openingReminder")}</p> : null}
      {session.isError || (session.isSuccess && !identity) ? <p role="alert" className="text-sm text-destructive">{t("payroll.identityRequired")}</p> : null}
      {payroll.isPending && !data ? <p role="status" className="text-sm text-muted-foreground">{t("payroll.loading")}</p> : null}
      {payroll.isError && !data ? <p role="alert" className="text-sm text-destructive">{t("payroll.loadError", { code: visibleError(payroll.error) })}</p> : null}
      {data ? (
        <>
          <dl className="employee-account-summary">
            {(["wagesOwed", "advancesOwed"] as const).map(key => <div key={key}>
              <dt>{t(`payroll.${key}`)}</dt>
              <dd><MoneyValue exact aggregate value={aggregateMoney(data.summary[key])} currencyLabel={currencyLabel} /></dd>
            </div>)}
          </dl>
          <details className="employee-account-breakdown">
            <summary>{t("payroll.breakdown")}</summary>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ["approvedEarnings", data.summary.approvedEarnings],
              ["wageCashPaid", data.summary.wageCashPaid],
              ["wagesOffset", data.summary.wagesOffset],
              ["advancesGiven", data.summary.advancesGiven],
              ["advancesCashRecovered", data.summary.advancesCashRecovered],
              ["advancesOffset", data.summary.advancesOffset],
              ["unallocatedEarnings", data.summary.unallocatedEarnings],
            ] as const).map(([key, value]) => (
              <div key={key} className="border-b border-border/60 py-2">
                <dt className="text-sm text-muted-foreground">{t(`payroll.${key}`)}</dt>
                <dd className="mt-1"><MoneyValue exact aggregate value={aggregateMoney(value)} currencyLabel={currencyLabel} /></dd>
              </div>
            ))}
          </dl>
          </details>
          <div className="employee-operation"><div className="flex flex-wrap gap-2" role="group" aria-label={t("payroll.actions")}>
            {(["cash", "offset", "repay"] as const).map(item => (
              <Button key={item} type="button" size="sm" variant={action === item ? "default" : "outline"} aria-pressed={action === item} onClick={() => { setAction(item); setAmount(""); setPercentageDraft(null); setError("") }} disabled={locked || busy}>
                {t(`payroll.action.${item}`)}
              </Button>
            ))}
          </div>
          {action === "offset" ? <p className="text-sm text-muted-foreground">{t("payroll.offsetOptions")}</p> : null}
          <form className="employee-payment-form grid min-w-0 grid-cols-1 gap-4 [&>label]:min-w-0 sm:grid-cols-2" onSubmit={submit}>
            {action !== "repay" ? (
              <label className="space-y-1 text-sm">
                <span>{t("payroll.earning")}</span>
                <NativeSelect aria-label={t("payroll.earning")} value={earningId} onChange={event => { setEarningId(event.target.value); setAmount(""); setPercentageDraft(null); setError("") }} disabled={locked || (availableEarnings.length === 0 && !openingWage)}>
                  {availableEarnings.map(item => <option key={item.earning.id} value={item.earning.id}>{item.earning.periodStart.slice(0, 10)} · {t(`payroll.registration.${item.registration}`)} · {item.remaining} {currencyLabel}</option>)}
                  {openingWage ? <option value={`opening:${openingWage.sourceId}`}>{t("employeeOpening.wages")} · {openingWage.remaining} {currencyLabel}</option> : null}
                  {!availableEarnings.length && !openingWage ? <option value="">{t("payroll.noEarnings")}</option> : null}
                </NativeSelect>
              </label>
            ) : null}
            {action !== "cash" ? (
              <label className="space-y-1 text-sm">
                <span>{t("payroll.advance")}</span>
                <NativeSelect aria-label={t("payroll.advance")} value={advanceId} onChange={event => setAdvanceId(event.target.value)} disabled={locked || (availableAdvances.length === 0 && !openingAdvance)}>
                  {availableAdvances.map(item => <option key={item.advance.id} value={item.advance.id}>{item.advance.amount} {currencyLabel} · {t("payroll.remaining")} {item.remaining} {currencyLabel}</option>)}
                  {openingAdvance ? <option value={`opening:${openingAdvance.sourceId}`}>{t("employeeOpening.advances")} · {openingAdvance.remaining} {currencyLabel}</option> : null}
                  {!availableAdvances.length && !openingAdvance ? <option value="">{t("payroll.noAdvances")}</option> : null}
                </NativeSelect>
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              <span>{action === "offset" ? t("payroll.offsetAmount") : action === "repay" ? t("payroll.repaymentAmount") : t("payroll.wageCashAmount")}</span>
              <CurrencyInput aria-label={action === "offset" ? t("payroll.offsetAmount") : action === "repay" ? t("payroll.repaymentAmount") : t("payroll.wageCashAmount")} currencyLabel={currencyLabel} value={amount} onChange={event => { setAmount(event.target.value); setPercentageDraft(null); setError("") }} disabled={locked} required={action !== "cash"} />
            </label>
            {percentageBasis && !locked ? <>
              <label className="space-y-1 text-sm">
                <span>{t("payroll.paymentPercentage")}</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3" dir="ltr" inputMode="decimal" aria-label={t("payroll.paymentPercentage")} value={percentageDraft ?? percentageDisplay} onChange={event => editPercentage(event.target.value)} />
                <span className="block text-xs text-muted-foreground">{t("payroll.percentageBasis")} <MoneyValue exact value={percentageBasis} currencyLabel={currencyLabel} />{percentageApproximate ? ` · ${t("payroll.approximatePercentage")}` : ""}</span>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="button" variant="outline" onClick={() => editPercentage("25")}>{t("payroll.quarter")}</Button>
                <Button type="button" variant="outline" onClick={() => editPercentage("50")}>{t("payroll.half")}</Button>
                <Button type="button" variant="outline" onClick={() => { setAmount(selectedEarning!.remaining); setPercentageDraft(null); setError("") }}>{t("payroll.entireRemainder")}</Button>
              </div>
              {paymentPreview ? <div role="status" className="space-y-1 rounded-md border border-border p-3 text-sm sm:col-span-2">
                <p>{t("payroll.proposedPayment")} <MoneyValue exact value={paymentPreview.amount} currencyLabel={currencyLabel} /></p>
                <p>{t("payroll.remainingAfterPayment")} <MoneyValue exact value={paymentPreview.remaining} currencyLabel={currencyLabel} /> · {paymentPreview.outstanding.approximate ? "≈ " : ""}{paymentPreview.outstanding.value}%</p>
                {cumulativeCashPercentage ? <p>{t("payroll.cumulativeCashPaid")} {cumulativeCashPercentage.approximate ? "≈ " : ""}{cumulativeCashPercentage.value}%</p> : null}
                <p>{t("payroll.cumulativeSettlement")} {paymentPreview.cumulative.approximate ? "≈ " : ""}{paymentPreview.cumulative.value}%</p>
              </div> : null}
            </> : null}
            {action === "cash" ? (
              <label className="space-y-1 text-sm">
                <span>{t("payroll.advanceCashAmount")}</span>
                <CurrencyInput aria-label={t("payroll.advanceCashAmount")} currencyLabel={currencyLabel} value={advanceAmount} onChange={event => setAdvanceAmount(event.target.value)} disabled={locked} />
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              <span>{t("payroll.date")}</span>
              <DatePicker value={date} onChange={setDate} disabled={locked} aria-required="true" />
            </label>
            {action === "cash" && selectedEarning ? <p className="self-end text-xs text-muted-foreground">{t("payroll.wageAvailable")} <MoneyValue exact value={selectedEarning.remaining} currencyLabel={currencyLabel} /></p> : null}
            {action === "offset" && selectedAdvance && selectedEarning ? <p className="self-end text-xs text-muted-foreground">{t("payroll.offsetMaximum")} <MoneyValue exact value={minor(selectedEarning.remaining) < minor(selectedAdvance.remaining) ? wire(minor(selectedEarning.remaining)) : wire(minor(selectedAdvance.remaining))} currencyLabel={currencyLabel} /></p> : null}
            {currentError ? <p role="alert" className="sm:col-span-2 text-sm text-destructive">{t(`payroll.error.${currentError}`, { defaultValue: t("payroll.writeError") })}</p> : null}
            {pending ? (
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <div role="status" className="space-y-1 text-sm text-muted-foreground">
                  <p>{t("payroll.pendingRetry")}</p>
                  {pending.action === "cash" ? (
                    <p className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>{t("payroll.pendingWage")} <MoneyValue exact value={pendingWageAmount ?? ZERO} currencyLabel={currencyLabel} /></span>
                      {pending.payload.advanceAmount ? <span>{t("payroll.pendingAdvance")} <MoneyValue exact value={pending.payload.advanceAmount} currencyLabel={currencyLabel} /></span> : null}
                      <span>{t("payroll.pendingCashTotal")} <MoneyValue exact value={pending.payload.amount} currencyLabel={currencyLabel} /></span>
                    </p>
                  ) : <p><MoneyValue exact value={pending.payload.amount} currencyLabel={currencyLabel} /></p>}
                </div>
                {refusedAttemptId !== null && refusedAttemptId === pending.attemptId ? <Button type="button" disabled={busy} onClick={() => void discardRefusedIntent(pending)}>{t("common.cancel")}</Button> : null}
                <Button type="button" disabled={busy || identityKey !== JSON.stringify(pending.identity)} onClick={() => void retryIntent(pending)}>{busy ? t("payroll.saving") : t("payroll.retry")}</Button>
              </div>
            ) : (
              <Button type="submit" className="sm:col-span-2 sm:justify-self-start" disabled={busy || storageError || !identity || (percentageDraft !== null && percentageBasis !== undefined && !paymentPreview) || (action === "repay" && !selectedAdvance && !selectedOpeningAdvance) || (action === "offset" && (!selectedAdvance || !selectedEarning))}>
                {busy ? t("payroll.saving") : t(`payroll.submit.${action}`)}
              </Button>
            )}
            {!pending && action === "repay" && !selectedAdvance && !selectedOpeningAdvance ? <p className="text-sm text-muted-foreground">{t(availableAdvances.length > 0 || openingAdvance ? "payroll.error.ADVANCE_REQUIRED" : "payroll.noRepayableAdvance")}</p> : null}
            {!pending && action === "offset" && (!selectedAdvance || !selectedEarning) ? <p className="text-sm text-muted-foreground">{t("payroll.offsetSourcesRequired")}</p> : null}
          </form></div>
          <details className="border-t border-border/60 pt-3">
            <summary className="cursor-pointer text-sm font-medium">{t("payroll.history")}</summary>
            <ol className="mt-3 space-y-2 text-sm">
              {data.cash.map(record => <li key={record.id} className="flex flex-wrap justify-between gap-2"><span>{t("payroll.historyCash")} · <AppDate value={record.paymentDate} /></span><MoneyValue exact value={record.amount} currencyLabel={currencyLabel} /></li>)}
              {data.offsets.map(record => <li key={record.id} className="flex flex-wrap justify-between gap-2"><span>{t("payroll.historyOffset")} · <AppDate value={record.settlementDate} /></span><MoneyValue exact value={record.amount} currencyLabel={currencyLabel} /></li>)}
              {data.repayments.map(record => <li key={record.id} className="flex flex-wrap justify-between gap-2"><span>{t("payroll.historyRepayment")} · <AppDate value={record.paymentDate} /></span><MoneyValue exact value={record.amount} currencyLabel={currencyLabel} /></li>)}
              {data.cash.length + data.offsets.length + data.repayments.length === 0 ? <li className="text-muted-foreground">{t("payroll.historyEmpty")}</li> : null}
            </ol>
          </details>
        </>
      ) : null}
      <EmployeeOpeningPanel employeeId={employeeId} />
    </section>
  )
}
