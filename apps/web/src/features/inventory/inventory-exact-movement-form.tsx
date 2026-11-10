import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Quantity, type ExactInventoryClient, type InventoryItemDefinition, type ExactInventoryAsset } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ExactPriceInput } from "@/features/shared/exact-price-input"
import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { exactCommercePrefix } from "@/features/shared/exact-commerce-queries"
import { locationInput, type ExactInventoryLocation, type ExactInventoryParty } from "./inventory-exact-page"
import type { ExactInventoryAction } from "./inventory-exact-queries"

type Contents = Awaited<ReturnType<ExactInventoryClient["locationContents"]>>
export function ExactInventoryMovementForm({ client, contents, definitions, locations, parties, source, pending, error, close, submit }: { client: ExactInventoryClient; contents: Contents; definitions: InventoryItemDefinition[]; locations: ExactInventoryLocation[]; parties: ExactInventoryParty[]; source: string; pending: boolean; error: string | null; close(): void; submit(command: ExactInventoryAction): Promise<void> }) {
  const { t, i18n } = useTranslation()
  const options = [
    ...contents.consumables.filter(row => row.quantity > 0).map(row => ({ id: row.id, itemId: row.itemDefinitionId, label: `${row.itemName} · ${row.quantity}`, quantity: row.quantity, asset: null as ExactInventoryAsset | null, entryId: row.inventoryEntryId })),
    ...contents.assets.map(row => ({ id: row.id, itemId: row.itemDefinitionId, label: row.assetName, quantity: 1, asset: row, entryId: row.inventoryEntryId })),
  ].filter(row => definitions.some(definition => definition.id === row.itemId && definition.isActive))
  const [pick, setPick] = useState(options[0]?.id ?? "")
  const [mode, setMode] = useState<"TRANSFER" | "SALE" | "GIFT" | "RETURN">("TRANSFER")
  const [quantity, setQuantity] = useState("1")
  const [destination, setDestination] = useState("")
  const [party, setParty] = useState(parties[0]?.id ?? "")
  const [valuation, setValuation] = useState<"NONE" | "PRICE" | "DERIVED">("NONE")
  const [price, setPrice] = useState("")
  const [originalQuantity, setOriginalQuantity] = useState("1")
  const [createDebt, setCreateDebt] = useState(false)
  const [debtValue, setDebtValue] = useState("")
  const [paidValue, setPaidValue] = useState("")
  const [chargeOverride, setChargeOverride] = useState(false)
  const [chargeValue, setChargeValue] = useState("")
  const [note, setNote] = useState("")
  const selected = options.find(row => row.id === pick)
  const target = locationInput(destination, locations)
  const from = locationInput(source, locations)
  const projectPlacement = mode === "TRANSFER" && Boolean(selected?.asset && target?.projectId)
  const defaults = useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "charge-default", selected?.id], enabled: projectPlacement,
    queryFn: () => { if (!selected?.asset) throw new Error("Choose an asset"); return client.chargeDefault({ assetUnitId: selected.id }) } })
  let command: ExactInventoryAction | null = null
  try {
    if (!selected?.itemId || !from) throw new Error("Choose stock")
    const count = selected.asset ? 1 : Number(quantity)
    if (!selected.asset) Quantity.inventory(quantity)
    if (!Number.isFinite(count) || count <= 0 || count > selected.quantity) throw new Error("Unavailable quantity")
    if (mode === "TRANSFER") {
      if (!target || destination === source) throw new Error("Choose a different destination")
      const to = { toWarehouseId: target.warehouseId, toProjectId: target.projectId }
      if (selected.asset) {
        const chargeAmountDzd = projectPlacement && chargeOverride ? parseLocalizedMoneyInput(chargeValue).toWire() : undefined
        if (chargeAmountDzd?.startsWith("-")) throw new Error("Negative charge")
        command = { kind: "transferAsset", input: { requestId: "pending", assetUnitId: selected.id, ...to, chargeAmountDzd, note: note.trim() || null } }
      } else command = { kind: "transferConsumable", input: { requestId: "pending", inventoryEntryId: selected.entryId, quantity: count, fromWarehouseId: from.warehouseId, fromProjectId: from.projectId, ...to, note: note.trim() || null } }
    } else {
      if (!party) throw new Error("Choose a counterparty")
      const unitPriceDzd = valuation === "PRICE" ? parseLocalizedUnitPriceInput(price).toWire() : undefined
      const total = valuation === "DERIVED" ? parseLocalizedMoneyInput(price).toWire() : undefined
      if (unitPriceDzd?.startsWith("-") || total?.startsWith("-")) throw new Error("Negative valuation")
      const derivedPrice = total === undefined ? undefined : { total, originalQuantity: Quantity.inventory(originalQuantity).toWire() }
      if (derivedPrice && (derivedPrice.originalQuantity.startsWith("-") || derivedPrice.originalQuantity === "0")) throw new Error("Positive source quantity required")
      const debtAmountDzd = createDebt && mode !== "GIFT" ? parseLocalizedMoneyInput(debtValue).toWire() : undefined
      const firstPaymentAmountDzd = debtAmountDzd === undefined ? undefined : parseLocalizedMoneyInput(paidValue || "0").toWire()
      if (debtAmountDzd?.startsWith("-") || firstPaymentAmountDzd?.startsWith("-") || debtAmountDzd !== undefined && firstPaymentAmountDzd !== undefined && parseLocalizedMoneyInput(firstPaymentAmountDzd).compare(parseLocalizedMoneyInput(debtAmountDzd)) > 0) throw new Error("Invalid debt/payment")
      command = { kind: "createOutbound", input: { requestId: "pending", fromType: from.warehouseId ? "WAREHOUSE" : "PROJECT", fromId: from.warehouseId ?? from.projectId!, transferType: mode, counterpartyId: party, notes: note.trim() || null, debtAmountDzd, firstPaymentAmountDzd,
        items: [{ itemId: selected.itemId, optionId: selected.id, quantity: count, unitPriceDzd, derivedPrice }] } }
    }
  } catch { command = null }
  return <Dialog open onOpenChange={open => { if (!open && !pending) close() }}><DialogContent dir={i18n.dir()} className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("exactCommerce.movementTitle")}</DialogTitle><DialogDescription>{t("exactCommerce.internalMovementDescription", { source: locations.find(row => `${row.type}:${row.id}` === source)?.label })}</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={event => { event.preventDefault(); if (command) void submit(command).then(close).catch(() => {}) }}>
    <fieldset disabled={pending} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">{t("exactCommerce.movementType")}<NativeSelect value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="TRANSFER">{t("exactCommerce.internalTransfer")}</option><option value="SALE">{t("exactCommerce.sale")}</option><option value="GIFT">{t("exactCommerce.gift")}</option><option value="RETURN">{t("exactCommerce.return")}</option></NativeSelect></label><label className="space-y-2">{t("exactCommerce.selectedStock")}<NativeSelect value={pick} onChange={event => { setPick(event.target.value); setChargeOverride(false); setChargeValue("") }}>{options.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label></div>{!options.length && <p role="status">{t("exactCommerce.noAvailableStock")}</p>}
    {!selected?.asset && <label className="block space-y-2">{t("exactCommerce.transferQuantity")}<Input dir="ltr" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>}
    {mode === "TRANSFER" ? <><label className="block space-y-2">{t("exactCommerce.destination")}<NativeSelect value={destination} onChange={event => { setDestination(event.target.value); setChargeOverride(false); setChargeValue("") }}><option value="">{t("exactCommerce.selectDifferentDestination")}</option>{locations.filter(row => `${row.type}:${row.id}` !== source).map(row => <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>{row.label}</option>)}</NativeSelect></label>
      {projectPlacement && <section className="space-y-3 border-t border-border pt-4"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={chargeOverride} onChange={event => { setChargeOverride(event.target.checked); if (event.target.checked) setChargeValue(defaults.data?.amountDzd ?? "") }} />{t("exactCommerce.overrideCharge")}</label>{chargeOverride ? <CurrencyAmountInput exact label={t("exactCommerce.projectChargeAmount")} value={chargeValue} onChange={setChargeValue} /> : defaults.isPending ? <p role="status">{t("exactCommerce.loadingChargeDefault")}</p> : defaults.isError ? <div role="alert">{t("exactCommerce.loadChargeDefaultError")} <Button type="button" variant="outline" onClick={() => void defaults.refetch()}>{t("common.retry")}</Button></div> : defaults.data && <p>{t("exactCommerce.defaultCharge")} <bdi>{defaults.data.amountDzd}</bdi> {t("exactCommerce.currencySeparator")} {defaults.data.source === "LAST_CHARGE" ? t("exactCommerce.lastChargeSource") : t("exactCommerce.purchasePriceSource")}{t("exactCommerce.chargeOverrideHint")}</p>}</section>}
    </> : <><label className="block space-y-2">{t("exactCommerce.externalParty")}<NativeSelect value={party} onChange={event => setParty(event.target.value)}>{parties.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label><label className="block space-y-2">{t("exactCommerce.optionalValuation")}<NativeSelect value={valuation} onChange={event => { setValuation(event.target.value as typeof valuation); setPrice("") }}><option value="NONE">{t("exactCommerce.unpricedNotZero")}</option><option value="PRICE">{t("exactCommerce.enteredUnitPrice")}</option><option value="DERIVED">{t("exactCommerce.derivedPrice")}</option></NativeSelect></label>
      {valuation === "PRICE" && <ExactPriceInput label={t("exactCommerce.outboundUnitPrice")} value={price} onChange={setPrice} />}{valuation === "DERIVED" && <div className="grid gap-4 sm:grid-cols-2"><CurrencyAmountInput exact label={t("exactCommerce.sourceAgreedTotal")} value={price} onChange={setPrice} /><label className="space-y-2">{t("exactCommerce.originalSourceQuantity")}<Input dir="ltr" inputMode="decimal" value={originalQuantity} onChange={event => setOriginalQuantity(event.target.value)} /></label></div>}
      {mode !== "GIFT" && <section className="space-y-4 border-t border-border pt-4"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={createDebt} onChange={event => setCreateDebt(event.target.checked)} />{mode === "SALE" ? t("exactCommerce.saleDebtMode") : t("exactCommerce.returnDebtMode")}</label>{createDebt && <div className="grid gap-4 sm:grid-cols-2"><CurrencyAmountInput exact label={t("exactCommerce.fullDebtAmount")} value={debtValue} onChange={setDebtValue} /><CurrencyAmountInput exact label={t("exactCommerce.optionalInitialPayment")} value={paidValue} onChange={setPaidValue} /></div>}</section>}
    </>}
    <label className="block space-y-2">{t("exactCommerce.movementNote")}<Textarea value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></label></fieldset>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex gap-2"><Button type="submit" disabled={pending || !command || projectPlacement && !chargeOverride && !defaults.data}>{pending ? t("common.saving") : t("exactCommerce.confirmMovement")}</Button><Button type="button" variant="outline" disabled={pending} onClick={close}>{t("common.back")}</Button></div>
  </form></DialogContent></Dialog>
}
