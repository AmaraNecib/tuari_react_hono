import { FailureCode } from "@/lib/failure-code"
import { PurchaseAttachmentFiles, usePurchaseAttachmentDraft } from "./inventory-exact-attachments"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Money, Quantity, ExactLine, finalizeLines, type InventoryItemDefinition, type ExactInventoryInvoiceInput } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Input } from "@/components/ui/input"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ExactPriceInput } from "@/features/shared/exact-price-input"
import { MoneyValue } from "@/features/shared/money-value"
import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { locationInput, type ExactInventoryLocation, type ExactInventoryParty } from "./inventory-exact-page"
import type { ExactInventoryAction } from "./inventory-exact-queries"

type Line = { key: string; itemId: string; quantity: string; mode: "unit-price" | "agreed-total"; value: string; assetName: string; location: string }
// Use the submitted numeric percentage, including exponent notation, as an exact ratio.
function percentagePaid(gross: string, percent: number): Money {
  if (percent < 1e-18) return Money.parse("0")
  const [coefficient = "0", exponent = "0"] = String(percent).toLowerCase().split("e")
  const fraction = coefficient.split(".")[1] ?? ""
  const numerator = coefficient.replace(".", "").replace(/^0+(?=\d)/, "")
  const denominator = `1${"0".repeat(fraction.length + 2 - Number(exponent))}`
  return finalizeLines([ExactLine.fromDerived(Money.parse(gross), Quantity.parse(denominator), Quantity.parse(numerator))])
}
const fresh = (definition?: InventoryItemDefinition): Line => ({ key: crypto.randomUUID(), itemId: definition?.id ?? "", quantity: "1", mode: "unit-price", value: "", assetName: definition?.name ?? "", location: "" })
export function ExactInventoryPurchaseForm({ definitions, locations, parties, pending, error, close, submit, onCreated }: { definitions: InventoryItemDefinition[]; locations: ExactInventoryLocation[]; parties: ExactInventoryParty[]; pending: boolean; error: import("react").ReactNode; close(): void; submit(command: ExactInventoryAction): Promise<unknown>; onCreated?(id: string): void }) {
  const { t, i18n } = useTranslation()
  const attachments = usePurchaseAttachmentDraft()
  const saveReasonId = useId()
  const supplierHintId = useId()
  const [createdId, setCreatedId] = useState<string | null>(null)
  const active = definitions.filter(row => row.isActive)
  const [lines, setLines] = useState<Line[]>(() => [fresh(active[0])])
  const [location, setLocation] = useState(locations[0] ? `${locations[0].type}:${locations[0].id}` : "")
  const [debt, setDebt] = useState(false)
  const [party, setParty] = useState(parties[0]?.id ?? "")
  const [supplierName, setSupplierName] = useState(parties[0]?.label ?? "")
  const selectedParty = parties.find(row => row.id === party)
  const [paymentMode, setPaymentMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT")
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHECK" | "">("")
  const [paid, setPaid] = useState("")
  const [percent, setPercent] = useState("0")
  const [number, setNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(getAlgeriaDateInputValue)
  const [note, setNote] = useState("")
  const normalizedPercent = Number(percent)
  let entries: ExactInventoryInvoiceInput["entries"] | null = null
  let total: string | null = null
  let paidAmount: string | undefined
  try {
    const sources: ExactLine[] = []
    entries = lines.map(line => {
      const definition = active.find(row => row.id === line.itemId)
      if (!definition) throw new Error("Choose active item")
      const destination = locationInput(line.location || location, locations)
      if (definition.itemType === "ASSET") {
        const purchasePriceDzd = parseLocalizedMoneyInput(line.value).toWire()
        if (purchasePriceDzd.startsWith("-") || !line.assetName.trim()) throw new Error("Invalid asset")
        sources.push(ExactLine.fromTotal(Money.parse(purchasePriceDzd), Quantity.inventory("1")))
        return { kind: "ASSET" as const, itemDefinitionId: definition.id, ...destination, assets: [{ assetName: line.assetName.trim(), purchasePriceDzd }] }
      }
      const count = Number(line.quantity)
      if (!Number.isFinite(count) || count <= 0) throw new Error("Invalid quantity")
      const q = Quantity.inventory(line.quantity)
      const source = line.mode === "unit-price" ? ExactLine.fromPrice(parseLocalizedUnitPriceInput(line.value), q) : ExactLine.fromTotal(parseLocalizedMoneyInput(line.value), q)
      if ((source.source.mode === "unit-price" ? source.source.price : source.source.total).startsWith("-")) throw new Error("Negative price")
      sources.push(source)
      return { kind: "CONSUMABLE" as const, itemDefinitionId: definition.id, ...destination, quantity: count,
        ...(source.source.mode === "unit-price" ? { unitPriceDzd: source.source.price } : { priceSource: source.toJSON() }) }
    })
    total = finalizeLines(sources).toWire()
    if (debt) {
      paidAmount = paymentMode === "AMOUNT" ? parseLocalizedMoneyInput(paid || "0").toWire() : undefined
      if (paidAmount?.startsWith("-") || paidAmount && Money.parse(paidAmount).compare(Money.parse(total)) > 0) throw new Error("Invalid first payment")
      if (paymentMode === "PERCENT" && (!percent.trim() || !Number.isFinite(normalizedPercent) || normalizedPercent < 0 || normalizedPercent > 100)) throw new Error("Invalid percentage")
    }
  } catch { entries = null }
  let hasInitialPayment = false
  try { hasInitialPayment = debt && total !== null && (paymentMode === "AMOUNT" ? Money.parse(paidAmount ?? "0").compare(Money.parse("0")) > 0 : Number.isFinite(normalizedPercent) && normalizedPercent >= 0 && normalizedPercent <= 100 && percentagePaid(total, normalizedPercent).compare(Money.parse("0")) > 0) } catch { /* Invalid operands are handled by form validation. */ }
  const destination = locationInput(location, locations)
  const date = toAlgeriaDayBoundaryIso(invoiceDate, "start")
  const valid = entries !== null && destination && date && (!debt || party)
  const uploadError = attachments.valid ? attachments.error : null
  const saveReason = (!attachments.valid ? attachments.error : null) ?? (!destination ? t("exactCommerce.purchaseNeedsDestination") : !date ? t("exactCommerce.purchaseNeedsDate") : !valid ? t("exactCommerce.purchaseNeedsValidFields") : null)
  function update(key: string, patch: Partial<Line>) { setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)) }
  return <Dialog open onOpenChange={open => { if (!open && !pending && !attachments.pending) close() }}><DialogContent dir={i18n.dir()} className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{t("exactCommerce.newInventoryInvoice")}</DialogTitle><DialogDescription>{t("exactCommerce.purchaseEditorDescription")}</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!valid || !entries || !date || !attachments.valid || attachments.pending) return; const create = createdId ? Promise.resolve({ group: { id: createdId } }) : submit({ kind: "createInvoice", input: { requestId: "pending", ...destination,
    invoiceNumber: number.trim() || null, invoiceDate: date, note: note.trim() || null, entries,
    supplierName: (selectedParty?.label ?? supplierName).trim() || null, externalCounterpartyId: party || null,
    ...(debt ? { createDebt: true, ...(hasInitialPayment && method ? { initialPaymentMethod: method } : {}), paymentInputType: paymentMode, ...(paymentMode === "AMOUNT" ? { paidAmountDzd: paidAmount ?? "0.00" } : { paidPercent: normalizedPercent }) } : { createDebt: false }) } }); void create.then(async result => { const id = (result as { group?: { id: string } } | undefined)?.group?.id; if (id) { setCreatedId(id); await attachments.upload(id); onCreated?.(id) } else if (attachments.files.length) { throw new Error("Missing created purchase identity") } close() }).catch(() => {}) }}>
    <fieldset disabled={pending || attachments.pending || Boolean(createdId)} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.optionalInvoiceNumber")}<Input value={number} maxLength={160} onChange={event => setNumber(event.target.value)} /></label><label className="space-y-2">{t("common.invoiceDate")}<Input type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} /></label></div>
    <CollapsibleSection title={t("exactCommerce.purchaseDebtMode")}><section className="space-y-4"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={debt} onChange={event => setDebt(event.target.checked)} />{t("exactCommerce.purchaseDebtMode")}</label>{debt && <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.initialPaymentMode")}<NativeSelect value={paymentMode} onChange={event => setPaymentMode(event.target.value as typeof paymentMode)}><option value="AMOUNT">{t("exactCommerce.fixedAmount")}</option><option value="PERCENT">{t("exactCommerce.percentage")}</option></NativeSelect></label>{paymentMode === "AMOUNT" ? <CurrencyAmountInput exact label={t("exactCommerce.optionalInitialPayment")} value={paid} onChange={setPaid} /> : <label className="space-y-2">{t("exactCommerce.initialPaymentPercent")}<Input dir="ltr" inputMode="decimal" value={percent} onChange={event => setPercent(event.target.value)} /></label>}{hasInitialPayment && <label className="space-y-2">{t("exactCommerce.paymentMethod")}<NativeSelect value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="">{t("exactCommerce.unknownPaymentMethod")}</option><option value="CASH">{t("exactCommerce.cash")}</option><option value="BANK_TRANSFER">{t("exactCommerce.bankTransfer")}</option><option value="CHECK">{t("exactCommerce.check")}</option></NativeSelect></label>}</div>}</section></CollapsibleSection>
    <CollapsibleSection title={t("exactCommerce.externalParty")}><div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2">{t("exactCommerce.externalParty")}<NativeSelect value={party} onChange={event => { const id = event.target.value; setParty(id); if (id) setSupplierName(parties.find(row => row.id === id)?.label ?? "") }}><option value="">{t("common.none")}</option>{parties.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label><label className="block space-y-2">{t("exactCommerce.supplierName")}<Input aria-label={t("exactCommerce.supplierName")} aria-describedby={selectedParty ? supplierHintId : undefined} value={selectedParty?.label ?? supplierName} maxLength={160} readOnly={Boolean(selectedParty)} onChange={event => setSupplierName(event.target.value)} />{selectedParty && <span id={supplierHintId} className="block text-xs text-muted-foreground">{t("exactCommerce.supplierFromParty")}</span>}</label></div></CollapsibleSection>
    <CollapsibleSection title={t("exactCommerce.defaultDestination")}><label className="block space-y-2">{t("exactCommerce.defaultDestination")}<NativeSelect value={location} onChange={event => setLocation(event.target.value)}>{locations.map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label></CollapsibleSection>
    <CollapsibleSection title={t("common.notes")}><div className="space-y-4"><label className="block space-y-2">{t("common.note")}<Textarea value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></label><PurchaseAttachmentFiles draft={{ ...attachments, error: attachments.valid ? null : attachments.error }} disabled={pending || Boolean(createdId)} /></div></CollapsibleSection>
    {lines.map((line, index) => { const definition = active.find(row => row.id === line.itemId); return <fieldset key={line.key} className="space-y-4 border-t border-border pt-4"><legend className="px-1 text-sm font-semibold">{t("exactCommerce.inventoryLineNumber", { number: index + 1 })}</legend><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.item")}<NativeSelect value={line.itemId} onChange={event => { const next = active.find(row => row.id === event.target.value); update(line.key, { itemId: event.target.value, value: "", assetName: next?.name ?? "" }) }}>{active.map(row => <option key={row.id} value={row.id}>{row.name} · {row.itemType === "ASSET" ? t("exactCommerce.asset") : t("exactCommerce.material")}</option>)}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.lineDestination")}<NativeSelect value={line.location || location} onChange={event => update(line.key, { location: event.target.value })}><option value="">{t("exactCommerce.defaultDestination")}</option>{locations.map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label></div>
      {definition?.itemType === "ASSET" ? <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.assetName")}<Input value={line.assetName} maxLength={160} onChange={event => update(line.key, { assetName: event.target.value })} /></label><CurrencyAmountInput exact label={t("exactCommerce.assetPurchasePrice")} value={line.value} onChange={value => update(line.key, { value })} /></div> : <div className="grid gap-4 sm:grid-cols-3"><label className="space-y-2">{t("exactCommerce.stockQuantity")}<Input dir="ltr" inputMode="decimal" value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value })} /></label><label className="space-y-2">{t("exactCommerce.pricingMode")}<NativeSelect value={line.mode} onChange={event => update(line.key, { mode: event.target.value as Line["mode"], value: "" })}><option value="unit-price">{t("exactCommerce.unitPrice")}</option><option value="agreed-total">{t("exactCommerce.agreedTotalMode")}</option></NativeSelect></label>{line.mode === "unit-price" ? <ExactPriceInput label={t("exactCommerce.unitPrice")} value={line.value} onChange={value => update(line.key, { value })} /> : <CurrencyAmountInput exact label={t("exactCommerce.agreedLineTotal")} value={line.value} onChange={value => update(line.key, { value })} />}</div>}
      {lines.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setLines(current => current.filter(row => row.key !== line.key))}>{t("exactCommerce.removeInventoryLineNumber", { number: index + 1 })}</Button>}</fieldset> })}
    <Button type="button" variant="outline" disabled={lines.length >= 50 || !active.length} onClick={() => setLines(current => [...current, fresh(active[0])])}>{t("exactCommerce.addInventoryLine")}</Button>
    </fieldset>
    {uploadError && <p role="alert" className="text-destructive">{uploadError}<FailureCode error={attachments.failure} /></p>}
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"><p>{t("exactCommerce.purchaseTotal")} {total !== null ? <MoneyValue exact value={total} currencyLabel={t("common.currency")} variant="detail" /> : t("exactCommerce.completePricing")}</p><div className="flex gap-2"><Button type="submit" aria-describedby={saveReason ? saveReasonId : undefined} disabled={pending || attachments.pending || !attachments.valid || !valid}>{pending || attachments.pending ? t("common.saving") : createdId ? t("inventory.invoiceCreate.retryAttachments") : t("exactCommerce.savePurchaseAndStock")}</Button><Button type="button" variant="outline" disabled={pending || attachments.pending} onClick={close}>{t("common.back")}</Button></div></div>{saveReason && <p id={saveReasonId} role="status" className="text-sm text-muted-foreground">{saveReason}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
  </form></DialogContent></Dialog>
}
