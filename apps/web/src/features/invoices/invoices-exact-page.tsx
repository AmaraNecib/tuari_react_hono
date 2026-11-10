import { useState } from "react"
import { useTranslation } from "react-i18next"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { Money, Quantity, finalizeLines, parseExactLine, type ExactInvoicesClient, type ExactInvoice, type ExactPayment } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Surface } from "@/features/shared/page-primitives"
import { MoneyValue } from "@/features/shared/money-value"
import { ExactPriceInput } from "@/features/shared/exact-price-input"
import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"
import { useExactInvoiceAction, useExactInvoices, useExactPayments, type ExactInvoiceAction } from "./invoices-exact-queries"

export type ExactInvoiceParty = { id: string; label: string; type: "EXTERNAL_COUNTERPARTY" | "WORKER" }
type DraftLine = { key: string; description: string; quantity: string; mode: "unit-price" | "agreed-total" | "derived-price"; value: string; originalQuantity?: string }
const freshLine = (): DraftLine => ({ key: crypto.randomUUID(), description: "", quantity: "1", mode: "unit-price", value: "" })
const statusLabel = { DRAFT: "exactCommerce.draft", RECEIVED: "exactCommerce.received", PAID: "exactCommerce.paid", VOIDED: "exactCommerce.voidedPayment" } as const

/** Actual opt-in invoice/payment workflow. Requires an exact client, never adapts numeric responses. */
export function ExactInvoicesPage({ client, parties }: { client: ExactInvoicesClient; parties: ExactInvoiceParty[] }) {
  const { t, i18n } = useTranslation()
  const invoices = useExactInvoices(client)
  const payments = useExactPayments(client)
  const mutation = useExactInvoiceAction(client)
  const [editor, setEditor] = useState<ExactInvoice | "new" | null>(null)
  const [payment, setPayment] = useState<ExactPayment | "new" | null>(null)
  const [cancel, setCancel] = useState<{ kind: "voidInvoice" | "voidPayment"; id: string } | null>(null)
  const [reason, setReason] = useState("")
  const [saved, setSaved] = useState(false)
  async function execute(action: ExactInvoiceAction) {
    await mutation.mutateAsync(action)
    setSaved(true)
  }
  const availableInvoices = invoices.data?.pages.flatMap(page => page.items) ?? []
  const availablePayments = payments.data?.pages.flatMap(page => page.items) ?? []
  return <main dir={i18n.dir()} aria-label={t("exactCommerce.invoicePageLabel")} className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{t("exactCommerce.invoiceTitle")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("exactCommerce.invoiceDescription")}</p></div>
      <div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending || !parties.length} onClick={() => { mutation.reset(); setEditor("new") }}>{t("exactCommerce.newInvoice")}</Button><Button variant="outline" disabled={mutation.isPending || !parties.length} onClick={() => { mutation.reset(); setPayment("new") }}>{t("exactCommerce.newPayment")}</Button></div></header>
    {saved && <p role="status">{t("exactCommerce.invoiceSaved")}</p>}
    {mutation.isError && !editor && !payment && !cancel && <p role="alert" className="text-destructive">{t("exactCommerce.commandError")}</p>}
    {invoices.isPending ? <p role="status">{t("exactCommerce.loadingInvoices")}</p> : invoices.isError ? <div role="alert">{t("exactCommerce.loadInvoicesError")} <Button variant="outline" onClick={() => void invoices.refetch()}>{t("common.retry")}</Button></div> : <Surface variant="card" className="min-w-0 p-5">
      <h2 className="mb-4 text-lg font-semibold">{t("exactCommerce.invoices")}</h2><div role="region" aria-label={t("exactCommerce.invoiceTable")} tabIndex={0} className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t("exactCommerce.invoiceAndParty")}</TableHead><TableHead>{t("exactCommerce.total")}</TableHead><TableHead>{t("exactCommerce.paidAmount")}</TableHead><TableHead>{t("exactCommerce.remaining")}</TableHead><TableHead>{t("exactCommerce.status")}</TableHead><TableHead>{t("exactCommerce.actions")}</TableHead></TableRow></TableHeader><TableBody>
        {availableInvoices.map(row => <TableRow key={row.id}><TableCell><p>{row.invoiceNumber || row.supplierName}</p><p className="mt-1 text-xs text-muted-foreground">{row.supplierName} · {row.direction === "PURCHASE" ? t("exactCommerce.purchasePayable") : t("exactCommerce.saleReceivable")}</p></TableCell>
          <TableCell><MoneyValue exact value={row.totalAmount} currencyLabel={t("common.currency")} /></TableCell><TableCell><MoneyValue exact value={row.paidAmount} currencyLabel={t("common.currency")} /></TableCell><TableCell><MoneyValue exact value={row.remainingAmount} currencyLabel={t("common.currency")} /></TableCell>
          <TableCell className="whitespace-nowrap">{t(statusLabel[row.status])}</TableCell><TableCell><div className="flex flex-nowrap items-center gap-2 [&>button]:min-h-11">
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { mutation.reset(); setEditor(row) }}>{row.status === "DRAFT" ? t("exactCommerce.editDraft") : t("exactCommerce.invoiceDetails")}</Button>
            {row.status === "DRAFT" && <><Button size="sm" disabled={mutation.isPending} onClick={() => void execute({ kind: "receiveInvoice", input: { requestId: "pending", id: row.id } }).catch(() => {})}>{t("exactCommerce.receiveInvoice")}</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => void execute({ kind: "deleteDraft", input: { requestId: "pending", id: row.id } }).catch(() => {})}>{t("exactCommerce.deleteDraft")}</Button></>}
            {(row.status === "RECEIVED" || row.status === "PAID") && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { mutation.reset(); setReason(""); setCancel({ kind: "voidInvoice", id: row.id }) }}>{t("exactCommerce.voidInvoice")}</Button>}
          </div></TableCell></TableRow>)}
      </TableBody></Table></div>{!availableInvoices.length && <p className="py-6">{t("exactCommerce.noInvoices")}</p>}
      {invoices.hasNextPage && <Button variant="outline" disabled={invoices.isFetchingNextPage} onClick={() => void invoices.fetchNextPage()}>{t("common.showMore")}</Button>}
    </Surface>}
    {payments.isPending ? <p role="status">{t("exactCommerce.loadingPayments")}</p> : payments.isError ? <div role="alert">{t("exactCommerce.loadPaymentsError")} <Button variant="outline" onClick={() => void payments.refetch()}>{t("common.retry")}</Button></div> : <Surface variant="card" className="min-w-0 p-5"><h2 className="mb-2 text-lg font-semibold">{t("exactCommerce.paymentsTitle")}</h2><p className="mb-4 text-sm text-muted-foreground">{t("exactCommerce.unallocatedDescription")}</p>
      <div role="region" aria-label={t("exactCommerce.paymentTable")} tabIndex={0} className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t("exactCommerce.party")}</TableHead><TableHead>{t("exactCommerce.amount")}</TableHead><TableHead>{t("exactCommerce.unallocated")}</TableHead><TableHead>{t("exactCommerce.linkedInvoices")}</TableHead><TableHead>{t("exactCommerce.actions")}</TableHead></TableRow></TableHeader><TableBody>{availablePayments.map(row => <TableRow key={row.id}>
        <TableCell>{parties.find(party => party.id === row.counterpartyId && party.type === row.counterpartyType)?.label ?? t("exactCommerce.partyUnavailable")}<p className="mt-1 text-xs">{row.status === "VOIDED" ? t("exactCommerce.voidedPayment") : row.direction === "PURCHASE" ? t("exactCommerce.paymentOutgoing") : t("exactCommerce.paymentIncoming")}</p></TableCell><TableCell><MoneyValue exact value={row.totalAmount} currencyLabel={t("common.currency")} /></TableCell><TableCell><MoneyValue exact value={row.unallocatedAmount} currencyLabel={t("common.currency")} /></TableCell>
        <TableCell>{row.allocations.map(allocation => <p key={allocation.id} className="mb-1 whitespace-nowrap">{availableInvoices.find(invoice => invoice.id === allocation.invoiceId)?.invoiceNumber ?? t("exactCommerce.invoice")} · <MoneyValue exact value={allocation.amount} currencyLabel={t("common.currency")} />{allocation.status === "VOIDED" ? t("exactCommerce.voidedAllocation") : ""}</p>)}</TableCell>
        <TableCell><div className="flex flex-wrap gap-2">{row.status === "LIVE" && <><Button size="sm" variant="outline" disabled={mutation.isPending || row.unallocatedAmount === "0.00"} onClick={() => { mutation.reset(); setPayment(row) }}>{t("exactCommerce.allocateRemaining")}</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { mutation.reset(); setReason(""); setCancel({ kind: "voidPayment", id: row.id }) }}>{t("exactCommerce.voidPayment")}</Button></>}{!row.allocations.length && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => void execute({ kind: "deleteUnallocatedPayment", input: { requestId: "pending", id: row.id } }).catch(() => {})}>{t("exactCommerce.deleteUnallocated")}</Button>}</div></TableCell>
      </TableRow>)}</TableBody></Table></div>{!availablePayments.length && <p className="py-5">{t("exactCommerce.noPayments")}</p>}{payments.hasNextPage && <Button variant="outline" disabled={payments.isFetchingNextPage} onClick={() => void payments.fetchNextPage()}>{t("common.showMore")}</Button>}
    </Surface>}
    {editor && <InvoiceEditor key={editor === "new" ? "new" : editor.id} invoice={editor === "new" ? null : editor} parties={parties} pending={mutation.isPending} error={mutation.isError ? t("exactCommerce.commandError") : null} close={() => setEditor(null)} submit={execute} />}
    {payment && <PaymentEditor key={payment === "new" ? "new" : payment.id} payment={payment === "new" ? null : payment} client={client} parties={parties} invoices={availableInvoices} pending={mutation.isPending} error={mutation.isError ? t("exactCommerce.commandError") : null} close={() => setPayment(null)} submit={execute} />}
    {cancel && <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) setCancel(null) }}><DialogContent dir={i18n.dir()} className="max-w-md"><DialogHeader><DialogTitle>{cancel.kind === "voidInvoice" ? t("exactCommerce.voidInvoice") : t("exactCommerce.voidPayment")}</DialogTitle><DialogDescription>{t("exactCommerce.voidDescription")}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (reason.trim()) void execute({ kind: cancel.kind, input: { requestId: "pending", id: cancel.id, reason: reason.trim() } }).then(() => setCancel(null)).catch(() => {}) }}>
      <label className="block space-y-2">{t("exactCommerce.voidReason")}<Textarea value={reason} maxLength={1000} disabled={mutation.isPending} onChange={event => setReason(event.target.value)} /></label>{mutation.isError && <p role="alert" className="text-destructive">{t("exactCommerce.commandError")}</p>}<div className="flex gap-2"><Button type="submit" disabled={mutation.isPending || !reason.trim()}>{t("exactCommerce.confirmVoid")}</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setCancel(null)}>{t("common.back")}</Button></div>
    </form></DialogContent></Dialog>}
  </main>
}

function InvoiceEditor({ invoice, parties, pending, error, close, submit }: { invoice: ExactInvoice | null; parties: ExactInvoiceParty[]; pending: boolean; error: string | null; close(): void; submit(command: ExactInvoiceAction): Promise<void> }) {
  const { t, i18n } = useTranslation()
  const [party, setParty] = useState(invoice ? `${invoice.counterpartyType}:${invoice.counterpartyId}` : parties[0] ? `${parties[0].type}:${parties[0].id}` : "")
  const [direction, setDirection] = useState(invoice?.direction ?? "PURCHASE")
  const [number, setNumber] = useState(invoice?.invoiceNumber ?? "")
  const [notes, setNotes] = useState(invoice?.notes ?? "")
  const [lines, setLines] = useState<DraftLine[]>(invoice ? invoice.lineItems.map(line => ({ key: line.id, description: line.description, quantity: line.source.quantity,
    mode: line.source.mode, value: line.source.mode === "unit-price" ? line.source.price : line.source.total,
    originalQuantity: line.source.mode === "derived-price" ? line.source.originalQuantity : undefined })) : [freshLine()])
  const readOnly = invoice !== null && invoice.status !== "DRAFT"
  let parsed: { description: string; source: ReturnType<typeof parseExactLine>["source"] }[] | null = null
  let total: string | null = null
  try {
    parsed = lines.map(line => ({ description: line.description.trim(), source: line.mode === "unit-price"
      ? { mode: "unit-price", price: parseLocalizedUnitPriceInput(line.value).toWire(), quantity: Quantity.parse(line.quantity).toWire() }
      : line.mode === "derived-price"
        ? { mode: "derived-price", total: parseLocalizedMoneyInput(line.value).toWire(), originalQuantity: Quantity.parse(line.originalQuantity ?? "").toWire(), quantity: Quantity.parse(line.quantity).toWire() }
        : { mode: "agreed-total", total: parseLocalizedMoneyInput(line.value).toWire(), quantity: Quantity.parse(line.quantity).toWire() } }))
    if (parsed.some(line => !line.description || line.source.quantity === "0" || line.source.quantity.startsWith("-") || (line.source.mode === "unit-price" ? line.source.price : line.source.total).startsWith("-"))) parsed = null
    if (parsed) total = finalizeLines(parsed.map(line => parseExactLine(line.source))).toWire()
  } catch { parsed = null }
  const chosenParty = parties.find(row => `${row.type}:${row.id}` === party)
  function update(key: string, patch: Partial<DraftLine>) { setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)) }
  return <Dialog open onOpenChange={open => { if (!open && !pending) close() }}><DialogContent dir={i18n.dir()} className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{readOnly ? t("exactCommerce.invoiceDetails") : invoice ? t("exactCommerce.editDraft") : t("exactCommerce.newInvoice")}</DialogTitle><DialogDescription>{t("exactCommerce.invoiceEditorDescription")}</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!parsed || !chosenParty) return; const lineItems = parsed; void submit(invoice ? { kind: "updateInvoice", input: { requestId: "pending", id: invoice.id, invoiceNumber: number.trim() || null, notes: notes.trim() || null, lineItems } } : { kind: "createInvoice", input: { requestId: "pending", counterpartyType: chosenParty.type, counterpartyId: chosenParty.id, supplierName: chosenParty.label, direction, invoiceNumber: number.trim() || null, notes: notes.trim() || null, lineItems } }).then(close).catch(() => {}) }}>
      <fieldset disabled={pending || readOnly} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.party")}<NativeSelect value={party} disabled={Boolean(invoice)} onChange={event => setParty(event.target.value)}>{parties.map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.invoiceDirection")}<NativeSelect value={direction} disabled={Boolean(invoice)} onChange={event => setDirection(event.target.value as typeof direction)}><option value="PURCHASE">{t("exactCommerce.purchasePayable")}</option>{chosenParty?.type !== "WORKER" && <option value="SALE">{t("exactCommerce.saleReceivable")}</option>}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.invoiceNumber")}<Input value={number} maxLength={100} onChange={event => setNumber(event.target.value)} /></label></div>
        {lines.map((line, index) => <fieldset key={line.key} className="space-y-3 border-t border-border pt-4"><legend className="px-1 text-sm font-medium">{t("exactCommerce.lineNumber", { number: index + 1 })}</legend><label className="block space-y-2">{t("exactCommerce.description")}<Input value={line.description} maxLength={300} onChange={event => update(line.key, { description: event.target.value })} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="space-y-2">{t("exactCommerce.quantity")}<Input dir="ltr" inputMode="decimal" value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value })} /></label><label className="space-y-2">{t("exactCommerce.pricingMode")}<NativeSelect value={line.mode} onChange={event => update(line.key, { mode: event.target.value as DraftLine["mode"], value: "" })}><option value="unit-price">{t("exactCommerce.unitPrice")}</option><option value="agreed-total">{t("exactCommerce.agreedTotalMode")}</option>{line.mode === "derived-price" && <option value="derived-price">{t("exactCommerce.derivedPrice")}</option>}</NativeSelect></label>{line.mode === "unit-price" ? <ExactPriceInput label={t("exactCommerce.unitPrice")} value={line.value} onChange={value => update(line.key, { value })} /> : <CurrencyAmountInput exact label={t("exactCommerce.agreedTotal")} value={line.value} onChange={value => update(line.key, { value })} />}</div>{line.mode === "derived-price" && <label className="block space-y-2">{t("exactCommerce.originalSourceQuantity")}<Input dir="ltr" inputMode="decimal" value={line.originalQuantity ?? ""} onChange={event => update(line.key, { originalQuantity: event.target.value })} /></label>}{lines.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setLines(current => current.filter(row => row.key !== line.key))}>{t("exactCommerce.removeLineNumber", { number: index + 1 })}</Button>}</fieldset>)}
        {!readOnly && <Button type="button" variant="outline" disabled={lines.length >= 50} onClick={() => setLines(current => [...current, freshLine()])}>{t("exactCommerce.addLine")}</Button>}<label className="block space-y-2">{t("common.notes")}<Textarea value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} /></label>
      </fieldset><div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"><p>{t("exactCommerce.total")} {total ? <MoneyValue exact value={total} currencyLabel={t("common.currency")} variant="detail" /> : t("exactCommerce.completeQuantityAndPrice")}</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={pending} onClick={close}>{t("common.back")}</Button>{!readOnly && <Button type="submit" disabled={pending || !parsed || !chosenParty || chosenParty.type === "WORKER" && direction === "SALE"}>{pending ? t("common.saving") : t("exactCommerce.saveDraft")}</Button>}</div></div>{error && <p role="alert" className="text-destructive">{error}</p>}
    </form>
  </DialogContent></Dialog>
}

function PaymentEditor({ payment, client, parties, invoices, pending, error, close, submit }: { payment: ExactPayment | null; client: ExactInvoicesClient; parties: ExactInvoiceParty[]; invoices: ExactInvoice[]; pending: boolean; error: string | null; close(): void; submit(command: ExactInvoiceAction): Promise<void> }) {
  const { t, i18n } = useTranslation()
  const [party, setParty] = useState(payment ? `${payment.counterpartyType}:${payment.counterpartyId}` : parties[0] ? `${parties[0].type}:${parties[0].id}` : "")
  const [direction, setDirection] = useState(payment?.direction ?? "PURCHASE")
  const [amount, setAmount] = useState(payment?.unallocatedAmount ?? "")
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHECK">("CASH")
  const [paymentDay, setPaymentDay] = useState(getAlgeriaDateInputValue)
  const paymentDate = toAlgeriaDayBoundaryIso(paymentDay, "start")
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState("")
  const chosen = parties.find(row => `${row.type}:${row.id}` === party)
  const eligible = invoices.filter(row => row.status === "RECEIVED" && row.counterpartyId === chosen?.id && row.counterpartyType === chosen?.type && row.direction === direction)
  let parsedAmount: string | null = null
  let parsedAllocations: { invoiceId: string; amount: string }[] = []
  let valid = false
  try {
    const total = parseLocalizedMoneyInput(amount)
    parsedAmount = total.toWire()
    parsedAllocations = eligible.flatMap(row => allocations[row.id]?.trim() ? [{ invoiceId: row.id, amount: parseLocalizedMoneyInput(allocations[row.id]!).toWire() }] : [])
    const sum = parsedAllocations.reduce((value, row) => value.add(Money.parse(row.amount)), Money.parse("0"))
    valid = Boolean(paymentDate) && total.compare(Money.parse("0")) > 0 && sum.compare(payment ? Money.parse(payment.unallocatedAmount) : total) <= 0 && parsedAllocations.every(row => Money.parse(row.amount).compare(Money.parse("0")) > 0 && Money.parse(row.amount).compare(Money.parse(eligible.find(invoice => invoice.id === row.invoiceId)!.remainingAmount)) <= 0) && (!payment || parsedAllocations.length > 0)
  } catch { valid = false }
  return <Dialog open onOpenChange={open => { if (!open && !pending) close() }}><DialogContent dir={i18n.dir()} className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{payment ? t("exactCommerce.allocatePaymentTitle") : t("exactCommerce.newPayment")}</DialogTitle><DialogDescription>{t("exactCommerce.paymentEditorDescription")}</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!valid || !chosen || !parsedAmount || !paymentDate) return; const input = payment ? { kind: "allocatePayment" as const, input: { requestId: "pending", id: payment.id, allocations: parsedAllocations } } : { kind: "createPayment" as const, input: { requestId: "pending", counterpartyType: chosen.type, counterpartyId: chosen.id, direction, paymentMethod: method, paymentDate, totalAmount: parsedAmount, allocations: parsedAllocations } }; void submit(input).then(close).catch(() => {}) }}>
      <fieldset disabled={pending} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.party")}<NativeSelect value={party} disabled={Boolean(payment)} onChange={event => { setParty(event.target.value); setAllocations({}) }}>{parties.map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.paymentDirection")}<NativeSelect value={direction} disabled={Boolean(payment)} onChange={event => { setDirection(event.target.value as typeof direction); setAllocations({}) }}><option value="PURCHASE">{t("exactCommerce.paymentOutgoing")}</option><option value="SALE">{t("exactCommerce.paymentIncoming")}</option></NativeSelect></label></div><CurrencyAmountInput exact label={payment ? t("exactCommerce.unallocatedAmount") : t("exactCommerce.paymentAmount")} value={amount} onChange={setAmount} disabled={Boolean(payment)} />{!payment && <label className="block space-y-2">{t("exactCommerce.paymentDate")}<Input type="date" value={paymentDay} onChange={event => setPaymentDay(event.target.value)} /></label>}{!payment && <label className="block space-y-2">{t("exactCommerce.paymentMethod")}<NativeSelect value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="CASH">{t("exactCommerce.cash")}</option><option value="BANK_TRANSFER">{t("exactCommerce.bankTransfer")}</option><option value="CHECK">{t("exactCommerce.check")}</option></NativeSelect></label>}
      <div className="border-t border-border pt-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{t("exactCommerce.allocateInvoices")}</h3><Button type="button" variant="outline" disabled={!parsedAmount || !eligible.length} onClick={() => { setLocalError(""); if (parsedAmount) void client.splitPayment({ requestId: "preview", amount: parsedAmount, invoiceIds: eligible.map(row => row.id) }).then(rows => setAllocations(Object.fromEntries(rows.map(row => [row.invoiceId, row.amount])))).catch(() => setLocalError("exactCommerce.splitError")) }}>{t("exactCommerce.equalSplit")}</Button></div>
        {eligible.map(row => <div key={row.id} className="mb-4 grid items-center gap-3 sm:grid-cols-2"><p>{row.invoiceNumber || row.supplierName}<span className="ms-2 text-sm">{t("exactCommerce.remaining")} <MoneyValue exact value={row.remainingAmount} currencyLabel={t("common.currency")} /></span></p><CurrencyAmountInput exact label={t("exactCommerce.invoiceAllocation", { invoice: row.invoiceNumber || row.supplierName })} value={allocations[row.id] ?? ""} onChange={value => setAllocations(current => ({ ...current, [row.id]: value }))} maxAmount={row.remainingAmount} onPayFull={() => setAllocations(current => ({ ...current, [row.id]: row.remainingAmount }))} /></div>)}{!eligible.length && <p className="text-sm">{t("exactCommerce.noEligibleInvoices")}</p>}
      </div></fieldset>{localError && <p role="alert" className="text-destructive">{t(localError)}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex gap-2"><Button type="submit" disabled={pending || !valid}>{pending ? t("common.saving") : t("exactCommerce.savePaymentAndAllocations")}</Button><Button type="button" variant="outline" disabled={pending} onClick={close}>{t("common.back")}</Button></div>
    </form>
  </DialogContent></Dialog>
}
