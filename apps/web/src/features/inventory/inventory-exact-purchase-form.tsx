import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Money, Quantity, ExactLine, finalizeLines, type InventoryItemDefinition, type ExactInventoryInvoiceInput } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
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
const fresh = (definition?: InventoryItemDefinition): Line => ({ key: crypto.randomUUID(), itemId: definition?.id ?? "", quantity: "1", mode: "unit-price", value: "", assetName: definition?.name ?? "", location: "" })
export function ExactInventoryPurchaseForm({ definitions, locations, parties, pending, error, close, submit }: { definitions: InventoryItemDefinition[]; locations: ExactInventoryLocation[]; parties: ExactInventoryParty[]; pending: boolean; error: string | null; close(): void; submit(command: ExactInventoryAction): Promise<void> }) {
  const { t, i18n } = useTranslation()
  const active = definitions.filter(row => row.isActive)
  const [lines, setLines] = useState<Line[]>(() => [fresh(active[0])])
  const [location, setLocation] = useState(locations[0] ? `${locations[0].type}:${locations[0].id}` : "")
  const [debt, setDebt] = useState(false)
  const [party, setParty] = useState(parties[0]?.id ?? "")
  const [paymentMode, setPaymentMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT")
  const [paid, setPaid] = useState("")
  const [percent, setPercent] = useState("0")
  const [number, setNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(getAlgeriaDateInputValue)
  const [note, setNote] = useState("")
  let entries: ExactInventoryInvoiceInput["entries"] | null = null
  let total: string | null = null
  let paidAmount: string | undefined
  try {
    const sources: ExactLine[] = []
    entries = lines.map(line => {
      const definition = active.find(row => row.id === line.itemId)
      if (!definition) throw new Error("Choose active item")
      const destination = line.location ? locationInput(line.location, locations) : null
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
      if (paymentMode === "PERCENT" && (!percent.trim() || !Number.isFinite(Number(percent)) || Number(percent) < 0 || Number(percent) > 100)) throw new Error("Invalid percentage")
    }
  } catch { entries = null }
  const destination = locationInput(location, locations)
  const date = toAlgeriaDayBoundaryIso(invoiceDate, "start")
  const valid = entries !== null && destination && date && (!debt || party)
  function update(key: string, patch: Partial<Line>) { setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)) }
  return <Dialog open onOpenChange={open => { if (!open && !pending) close() }}><DialogContent dir={i18n.dir()} className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{t("exactCommerce.newInventoryInvoice")}</DialogTitle><DialogDescription>{t("exactCommerce.purchaseEditorDescription")}</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!valid || !entries || !date) return; void submit({ kind: "createInvoice", input: { requestId: "pending", ...destination,
    invoiceNumber: number.trim() || null, invoiceDate: date, note: note.trim() || null, entries,
    ...(debt ? { createDebt: true, externalCounterpartyId: party, paymentInputType: paymentMode, ...(paymentMode === "AMOUNT" ? { paidAmountDzd: paidAmount ?? "0.00" } : { paidPercent: Number(percent) }) } : { createDebt: false }) } }).then(close).catch(() => {}) }}>
    <fieldset disabled={pending} className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><label className="space-y-2">{t("exactCommerce.defaultDestination")}<NativeSelect value={location} onChange={event => setLocation(event.target.value)}>{locations.map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.optionalInvoiceNumber")}<Input value={number} maxLength={160} onChange={event => setNumber(event.target.value)} /></label><label className="space-y-2">{t("common.invoiceDate")}<Input type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} /></label></div>
    {lines.map((line, index) => { const definition = active.find(row => row.id === line.itemId); return <fieldset key={line.key} className="space-y-4 border-t border-border pt-4"><legend className="px-1 text-sm font-semibold">{t("exactCommerce.inventoryLineNumber", { number: index + 1 })}</legend><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.item")}<NativeSelect value={line.itemId} onChange={event => { const next = active.find(row => row.id === event.target.value); update(line.key, { itemId: event.target.value, value: "", assetName: next?.name ?? "" }) }}>{active.map(row => <option key={row.id} value={row.id}>{row.name} · {row.itemType === "ASSET" ? t("exactCommerce.asset") : t("exactCommerce.material")}</option>)}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.lineDestination")}<NativeSelect value={line.location} onChange={event => update(line.key, { location: event.target.value })}><option value="">{t("exactCommerce.defaultDestination")}</option>{locations.map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label></div>
      {definition?.itemType === "ASSET" ? <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.assetName")}<Input value={line.assetName} maxLength={160} onChange={event => update(line.key, { assetName: event.target.value })} /></label><CurrencyAmountInput exact label={t("exactCommerce.assetPurchasePrice")} value={line.value} onChange={value => update(line.key, { value })} /></div> : <div className="grid gap-4 sm:grid-cols-3"><label className="space-y-2">{t("exactCommerce.stockQuantity")}<Input dir="ltr" inputMode="decimal" value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value })} /></label><label className="space-y-2">{t("exactCommerce.pricingMode")}<NativeSelect value={line.mode} onChange={event => update(line.key, { mode: event.target.value as Line["mode"], value: "" })}><option value="unit-price">{t("exactCommerce.unitPrice")}</option><option value="agreed-total">{t("exactCommerce.agreedTotalMode")}</option></NativeSelect></label>{line.mode === "unit-price" ? <ExactPriceInput label={t("exactCommerce.unitPrice")} value={line.value} onChange={value => update(line.key, { value })} /> : <CurrencyAmountInput exact label={t("exactCommerce.agreedLineTotal")} value={line.value} onChange={value => update(line.key, { value })} />}</div>}
      {lines.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setLines(current => current.filter(row => row.key !== line.key))}>{t("exactCommerce.removeInventoryLineNumber", { number: index + 1 })}</Button>}</fieldset> })}
    <Button type="button" variant="outline" disabled={lines.length >= 50 || !active.length} onClick={() => setLines(current => [...current, fresh(active[0])])}>{t("exactCommerce.addInventoryLine")}</Button>
    <section className="space-y-4 border-t border-border pt-4"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={debt} onChange={event => setDebt(event.target.checked)} />{t("exactCommerce.purchaseDebtMode")}</label>{debt && <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.externalParty")}<NativeSelect value={party} onChange={event => setParty(event.target.value)}>{parties.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label><label className="space-y-2">{t("exactCommerce.initialPaymentMode")}<NativeSelect value={paymentMode} onChange={event => setPaymentMode(event.target.value as typeof paymentMode)}><option value="AMOUNT">{t("exactCommerce.fixedAmount")}</option><option value="PERCENT">{t("exactCommerce.percentage")}</option></NativeSelect></label>{paymentMode === "AMOUNT" ? <CurrencyAmountInput exact label={t("exactCommerce.optionalInitialPayment")} value={paid} onChange={setPaid} /> : <label className="space-y-2">{t("exactCommerce.initialPaymentPercent")}<Input dir="ltr" inputMode="decimal" value={percent} onChange={event => setPercent(event.target.value)} /></label>}</div>}</section>
    <label className="block space-y-2">{t("common.note")}<Textarea value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></label></fieldset>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"><p>{t("exactCommerce.purchaseTotal")} {total !== null ? <MoneyValue exact value={total} currencyLabel={t("common.currency")} variant="detail" /> : t("exactCommerce.completePricing")}</p><div className="flex gap-2"><Button type="submit" disabled={pending || !valid}>{pending ? t("common.saving") : t("exactCommerce.savePurchaseAndStock")}</Button><Button type="button" variant="outline" disabled={pending} onClick={close}>{t("common.back")}</Button></div></div>{error && <p role="alert" className="text-destructive">{error}</p>}
  </form></DialogContent></Dialog>
}
