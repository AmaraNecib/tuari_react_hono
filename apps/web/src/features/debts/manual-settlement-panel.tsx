import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Money, type AppClient, type ExactDebtsClient } from "@tuari/contracts"
import { useSessionQuery } from "@/features/session/use-session-query"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"
import { Button } from "@/components/ui/button"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input"
import { AmountDisplay } from "@/components/ui"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ManualSettlementSummary } from "./manual-settlement-summary"
import { invalidateExactDebtQueries } from "./debts-exact-queries"
import { clearPendingSettlement, isDefiniteSettlementRefusal, loadPendingSettlement, savePendingSettlement, type PendingSettlement } from "./manual-settlement-pending"

export type ManualSettlementClient = AppClient["financial"]["manualSettlement"]
const scopes = new WeakMap<object, number>()
let nextScope = 0
export function manualSettlementScope(client: object) { if (!scopes.has(client)) scopes.set(client, ++nextScope); return scopes.get(client)! }
type Props = { client: ManualSettlementClient; debtClient: ExactDebtsClient; partyId: string }
export function ManualSettlementPanel(props: Props) {
  const session = useSessionQuery()
  const user = session.data?.user
  return user ? <ManualSettlementForm key={JSON.stringify([user.id, props.partyId, manualSettlementScope(props.client)])} {...props} owner={user.id} /> : null
}
function ManualSettlementForm({ client, debtClient, partyId, owner }: Props & { owner: string }) {
  const { t } = useTranslation()
  const queries = useQueryClient()
  const prefix = ["manual-settlement", manualSettlementScope(client), owner, partyId] as const
  const [formOpen, setFormOpen] = useState(false)
  const [payable, setPayable] = useState("")
  const [receivable, setReceivable] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [offset, setOffset] = useState(0)
  const [preview, setPreview] = useState<Awaited<ReturnType<ManualSettlementClient["preview"]>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [reverseId, setReverseId] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [initial] = useState(() => { try { return { pending: loadPendingSettlement(sessionStorage, owner, partyId), failed: false } } catch { return { pending: null, failed: true } } })
  const [pending, setPending] = useState<PendingSettlement | null>(initial.pending)
  const [storageFailed, setStorageFailed] = useState(initial.failed)
  const options = useQuery({ queryKey: [...prefix, "originals"], queryFn: () => client.candidates({ externalCounterpartyId: partyId }), retry: false })
  const history = useQuery({ queryKey: [...prefix, "history", offset], queryFn: () => client.history({ externalCounterpartyId: partyId, limit: 5, offset }), retry: false })
  const unavailable = history.error && "code" in history.error && history.error.code === "SERVICE_UNAVAILABLE"
  const locked = busy || pending !== null || storageFailed
  const p = options.data?.find(entry => entry.id === payable)
  const r = options.data?.find(entry => entry.id === receivable)
  const sourceHref = (entry: typeof p) => entry?.sourceKind === "PURCHASE" ? `/invoices/${encodeURIComponent(entry.sourceId)}` : entry?.sourceKind === "SALE" ? `/outbound-transfers?source=${encodeURIComponent(entry.sourceId)}` : null
  let parsed: string | null = null
  try { parsed = parseLocalizedMoneyInput(amount).toWire() } catch { /* Incomplete input has no preview. */ }
  const valid = Boolean(p && r && parsed && Money.parse(parsed).compare(Money.parse("0")) > 0 && Money.parse(parsed).compare(Money.parse(p.remainingDzd!)) <= 0 && Money.parse(parsed).compare(Money.parse(r.remainingDzd!)) <= 0)
  // The server re-resolves all required grants inside the command transaction.
  const canConfirm = true
  const canReverse = true
  function change(action: () => void) { action(); setPreview(null); setNotice("") }
  async function refresh() {
    await Promise.all([queries.invalidateQueries({ queryKey: ["manual-settlement"] }), invalidateExactDebtQueries(queries, debtClient, owner)])
  }
  async function execute(command: PendingSettlement) {
    if (busy || storageFailed) return
    try { savePendingSettlement(sessionStorage, owner, partyId, command) } catch { setStorageFailed(true); return }
    setPending(command); setBusy(true); setNotice("")
    try {
      if (command.kind === "confirm") await client.confirm(command.input)
      else await client.reverse(command.input)
      try { clearPendingSettlement(sessionStorage, owner, partyId, command) } catch { setStorageFailed(true); setNotice(t("manualSettlement.saved")); return }
      setPending(null); setPreview(null); setReverseId(null); setReason(""); setOffset(0)
      setNotice(t("manualSettlement.saved"))
      await refresh().catch(() => { setNotice(t("manualSettlement.saved")) })
    } catch (error) {
      if (isDefiniteSettlementRefusal(error)) {
        try { clearPendingSettlement(sessionStorage, owner, partyId, command); setPending(null); setPreview(null) } catch { setStorageFailed(true) }
        setNotice(error instanceof Error ? error.message : t("manualSettlement.invalid"))
      } else setNotice(t("manualSettlement.pending"))
    } finally { setBusy(false) }
  }
  async function requestPreview() {
    if (!valid || locked || !parsed) return
    setBusy(true); setNotice("")
    try { setPreview(await client.preview({ externalCounterpartyId: partyId, payableOriginalEntryId: payable, receivableOriginalEntryId: receivable, currency: "DZD", amountDzd: parsed })) }
    catch (error) { setPreview(null); setNotice(error instanceof Error ? error.message : t("manualSettlement.invalid")) }
    finally { setBusy(false) }
  }
  function confirm() {
    if (!preview || !parsed || locked || !canConfirm) return
    void execute({ kind: "confirm", input: { requestId: crypto.randomUUID(), externalCounterpartyId: partyId, payableOriginalEntryId: payable, receivableOriginalEntryId: receivable, currency: "DZD", amountDzd: parsed, expectedPayableRemainingDzd: preview.payableRemainingDzd, expectedReceivableRemainingDzd: preview.receivableRemainingDzd, note: note.trim() || null } })
  }
  const money = (value: string) => <AmountDisplay exact value={value} currencyLabel={t("exactDebts.currency")} />
  return <section aria-label={t("manualSettlement.title")} className="min-w-0 space-y-4 border-y border-border px-1 py-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">{t("manualSettlement.title")}</h2><details className="max-w-prose text-sm"><summary className="cursor-pointer rounded-md px-2 py-2 focus-visible:outline-2">{t("manualSettlement.information")}</summary><p className="py-2 leading-relaxed">{t("manualSettlement.help")}</p></details></div>
    {storageFailed && <p role="alert">{t("manualSettlement.storageError")}</p>}
    {pending && <div role="status" className="space-y-2 rounded-lg border border-border p-3"><p>{t("manualSettlement.pending")}</p><p>{pending.kind === "confirm" ? <>{t("manualSettlement.frozenAmount")}: {money(pending.input.amountDzd)}</> : pending.input.reason}</p><Button disabled={busy || storageFailed} onClick={() => void execute(pending)}>{busy ? t("manualSettlement.saving") : t("manualSettlement.retry")}</Button></div>}
    {unavailable ? <p role="status">{t("manualSettlement.unavailable")}</p> : history.isPending ? <p role="status">{t("manualSettlement.loading")}</p> : history.isError ? <div role="alert">{t("manualSettlement.loadError")} <Button variant="outline" onClick={() => { void options.refetch(); void history.refetch() }}>{t("exactDebts.retry")}</Button></div> : <>
      {options.isError && <p role="alert">{t("manualSettlement.loadError")}</p>}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogTrigger render={<Button />}>{t("manualSettlement.newSettlement")}</DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{t("manualSettlement.title")}</DialogTitle><DialogDescription>{t("manualSettlement.help")}</DialogDescription></DialogHeader>
      <form aria-label={t("manualSettlement.title")} className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); void requestPreview() }}>
        {(["PAYABLE", "RECEIVABLE"] as const).map(direction => <label key={direction} className="min-w-0 space-y-2 text-sm"><span>{t(direction === "PAYABLE" ? "manualSettlement.payable" : "manualSettlement.receivable")}</span><NativeSelect aria-label={t(direction === "PAYABLE" ? "manualSettlement.payable" : "manualSettlement.receivable")} disabled={locked} value={direction === "PAYABLE" ? payable : receivable} onChange={event => change(() => direction === "PAYABLE" ? setPayable(event.target.value) : setReceivable(event.target.value))}><option value="">{t("manualSettlement.select")}</option>{options.data?.filter(entry => entry.direction === direction).map(entry => <option key={entry.id} value={entry.id}>{t("manualSettlement.sourceOption", { source: entry.sourceLabel, amount: entry.remainingDzd })}</option>)}</NativeSelect>{(direction === "PAYABLE" ? p : r) && sourceHref(direction === "PAYABLE" ? p : r) && <a className="inline-block text-sm underline underline-offset-4" href={sourceHref(direction === "PAYABLE" ? p : r)!}>{t("manualSettlement.openSource", { source: (direction === "PAYABLE" ? p : r)!.sourceLabel })}</a>}</label>)}
        <CurrencyAmountInput exact label={t("manualSettlement.amount")} value={amount} onChange={value => change(() => setAmount(value))} disabled={locked} />
        <label className="space-y-2 text-sm"><span>{t("manualSettlement.note")}</span><Textarea aria-label={t("manualSettlement.note")} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={locked} /></label>
        <div><Button type="submit" variant="outline" disabled={!valid || locked}>{t("manualSettlement.preview")}</Button></div>
      </form>
      {preview && <section aria-label={t("manualSettlement.preview")} className="space-y-3 rounded-lg border border-border p-4" aria-live="polite"><div className="grid gap-4 sm:grid-cols-2">{(["payable", "receivable"] as const).map(side => <div key={side}><h3 className="font-semibold">{t(`manualSettlement.${side}`)}</h3><p>{t("manualSettlement.current")}: {money(side === "payable" ? preview.payableRemainingDzd : preview.receivableRemainingDzd)}</p><p>{t("manualSettlement.after")}: {money(side === "payable" ? preview.projectedPayableRemainingDzd : preview.projectedReceivableRemainingDzd)}</p></div>)}</div><p>{t("manualSettlement.net")}: <AmountDisplay aggregate value={preview.netPositionDzd} currencyLabel={t("exactDebts.currency")} /></p><Button disabled={locked || !canConfirm} onClick={confirm}>{t("manualSettlement.confirm")}</Button></section>}
      {pending && <p role="status">{t("manualSettlement.pending")}</p>}
      {storageFailed && <p role="alert">{t("manualSettlement.storageError")}</p>}
      {notice && <p role="status">{notice}</p>}
      </DialogContent>
      </Dialog>
      <div className="space-y-3 border-t border-border pt-6"><h3 className="font-semibold">{t("manualSettlement.history")}</h3>{!history.data?.items.length && <p className="text-sm">{t("manualSettlement.empty")}</p>}{history.data?.items.map(item => <article key={item.id} className="min-w-0 space-y-2 border-b border-border py-3" aria-label={t(item.reversal ? "manualSettlement.reversed" : "manualSettlement.live")}><ManualSettlementSummary item={item} />{!item.reversal && canReverse && <Button variant="outline" disabled={locked} onClick={() => { setReverseId(item.id); setReason("") }}>{t("manualSettlement.reverse")}</Button>}{reverseId === item.id && <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (reason.trim() && !locked) void execute({ kind: "reverse", input: { requestId: crypto.randomUUID(), settlementId: item.id, reason: reason.trim() } }) }}><label className="block space-y-2 text-sm"><span>{t("manualSettlement.reason")}</span><Textarea aria-label={t("manualSettlement.reason")} maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)} disabled={locked} /></label><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!reason.trim() || locked}>{t("manualSettlement.confirmReverse")}</Button><Button type="button" variant="outline" disabled={locked} onClick={() => setReverseId(null)}>{t("manualSettlement.cancel")}</Button></div></form>}</article>)}<div className="flex gap-2"><Button variant="outline" disabled={offset === 0 || locked} onClick={() => setOffset(Math.max(0, offset - 5))}>{t("manualSettlement.previous")}</Button><Button variant="outline" disabled={history.data?.nextOffset == null || locked} onClick={() => setOffset(history.data!.nextOffset!)}>{t("manualSettlement.next")}</Button></div></div>
    </>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>
}
