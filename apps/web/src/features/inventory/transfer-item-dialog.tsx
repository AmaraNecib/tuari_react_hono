import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { MAX_MONEY_DZD } from "@tuari/contracts"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { NativeSelect, Textarea } from "@/components/ui/form-controls"
import { formInputClassName } from "@/components/ui/form-controls"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import {
  useAssetChargeDefaultQuery,
  useTransferInventoryAssetMutation,
  useTransferInventoryConsumableMutation,
  useInventoryWarehousesQuery,
  useInventoryProjectsQuery,
} from "./inventory-hooks"

type TransferAssetTarget = {
  type: "ASSET"
  assetUnitId: string
  assetName: string
  sourceWarehouseId?: string | null
  sourceProjectId?: string | null
}

type TransferConsumableTarget = {
  type: "CONSUMABLE"
  inventoryEntryId: string
  itemName: string
  availableQuantity: number
  sourceWarehouseId?: string | null
  sourceProjectId?: string | null
}

/** TransferTarget. */
export type TransferTarget = TransferAssetTarget | TransferConsumableTarget

function roundMoney(value: number) {
  // Mirror the API helper's overflow guard: `value * 100` corrupts large
  // magnitudes, so return those unchanged instead of losing precision.
  if (Math.abs(value) * 100 > Number.MAX_SAFE_INTEGER) {
    return value
  }

  return Math.round(value * 100) / 100
}

/**
 * The amount expressed as a percentage of the purchase price (#413):
 * negative for a cut, positive above it, `null` when the purchase price is 0
 * (the percentage is undefined).
 */
export function chargePercentFromAmount(amountDzd: number, purchasePriceDzd: number): number | null {
  if (!Number.isFinite(purchasePriceDzd) || purchasePriceDzd <= 0) {
    return null
  }

  return roundMoney(((amountDzd - purchasePriceDzd) / purchasePriceDzd) * 100)
}

/** The amount implied by a percentage of the purchase price (never negative). */
export function chargeAmountFromPercent(percent: number, purchasePriceDzd: number): number {
  if (!Number.isFinite(purchasePriceDzd) || !Number.isFinite(percent)) {
    return 0
  }

  return Math.max(0, roundMoney(purchasePriceDzd * (1 + percent / 100)))
}

/**
 * The meaning of the amount field (#413):
 * - `default` — the field is blank, so the server resolves the unit's default;
 * - `amount`  — a valid non-negative amount (an explicit `0` is a free placement);
 * - `invalid` — a non-blank value that is not a valid amount, which must be
 *   rejected and surfaced, NOT silently coerced into a free placement.
 */
export type ChargeAmountInput =
  | { kind: "default" }
  | { kind: "amount"; value: number }
  | { kind: "invalid" }

/** Parse the amount field; see {@link ChargeAmountInput}. */
export function parseChargeAmountInput(value: string): ChargeAmountInput {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { kind: "default" }
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_MONEY_DZD) {
    return { kind: "invalid" }
  }

  return { kind: "amount", value: parsed }
}

/** Dialog for transferring inventory items between locations. */
/**
 * @description Component
 */
export function TransferItemDialog({
  open,
  target,
  onOpenChange,
}: {
  open: boolean
  target: TransferTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const assetMutation = useTransferInventoryAssetMutation()
  const consumableMutation = useTransferInventoryConsumableMutation()
  const warehousesQuery = useInventoryWarehousesQuery(open)
  const projectsQuery = useInventoryProjectsQuery(open)
  const chargeDefault = useAssetChargeDefaultQuery(
    open && target?.type === "ASSET" ? target.assetUnitId : undefined,
  )

  const [destType, setDestType] = useState<"WAREHOUSE" | "PROJECT">("WAREHOUSE")
  const [destId, setDestId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [chargeAmount, setChargeAmount] = useState("")
  const [chargePercent, setChargePercent] = useState("")
  const [amountTouched, setAmountTouched] = useState(false)
  const [note, setNote] = useState("")
  const [date, setDate] = useState(() => getAlgeriaDateInputValue())

  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const isPending = assetMutation.isPending || consumableMutation.isPending

  const purchasePriceDzd = chargeDefault.data?.purchasePriceDzd ?? 0
  // A failed default query must not be mistaken for a zero purchase price:
  // that silently disables percentage entry and drops the above-price warning,
  // so an operator could submit an over-bound amount un-warned (#422 round 4).
  const chargeDefaultUnavailable = chargeDefault.isError === true && chargeDefault.data === undefined
  // A pending query has no price either; showing "سعر الشراء: 0" then is the
  // same false zero for a beat, so say it is loading instead.
  const chargePricePending = chargeDefault.isPending === true && chargeDefault.data === undefined
  const hasPurchasePrice = Number.isFinite(purchasePriceDzd) && purchasePriceDzd > 0
  const isAsset = target?.type === "ASSET"
  const asksForCharge = isAsset && destType === "PROJECT"
  const amountInput = parseChargeAmountInput(chargeAmount)
  const chargeInvalid = amountInput.kind === "invalid"
  // With no resolvable price, a blank amount cannot fall back to the server
  // default (that is the read that just failed), so require an explicit amount
  // rather than submitting a request the server must reject (#422 round 4).
  const chargeRequired = chargeDefaultUnavailable && asksForCharge && amountInput.kind === "default"
  const warnsAbovePurchase =
    amountInput.kind === "amount" && purchasePriceDzd > 0 && amountInput.value > purchasePriceDzd

  // Prefill from the resolved default (last charge for the unit, else its
  // purchase price) whenever the dialog opens for an asset — but never
  // clobber an amount the operator has already typed. A refetch while the
  // dialog is open (a correction landing in another tab) only applies while
  // the field is still untouched.
  useEffect(() => {
    if (!open || target?.type !== "ASSET") return
    if (amountTouched) return
    const defaultAmount = chargeDefault.data?.amountDzd
    if (defaultAmount === undefined) return
    setChargeAmount(String(defaultAmount))
    const percent = chargePercentFromAmount(defaultAmount, chargeDefault.data!.purchasePriceDzd)
    setChargePercent(percent === null ? "" : String(percent))
  }, [open, target, chargeDefault.data, amountTouched])

  const resetForm = () => {
    setDestType("WAREHOUSE")
    setDestId("")
    setQuantity("1")
    setChargeAmount("")
    setChargePercent("")
    setAmountTouched(false)
    setNote("")
    setDate(getAlgeriaDateInputValue())
  }

  const handleAmountChange = (value: string) => {
    setChargeAmount(value)
    setAmountTouched(true)
    const parsed = parseChargeAmountInput(value)
    const percent = parsed.kind === "amount" ? chargePercentFromAmount(parsed.value, purchasePriceDzd) : null
    setChargePercent(percent === null ? "" : String(percent))
  }

  const handlePercentChange = (value: string) => {
    setChargePercent(value)
    setAmountTouched(true)
    if (value.trim().length === 0) {
      setChargeAmount("")
      return
    }

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return
    }

    setChargeAmount(String(chargeAmountFromPercent(parsed, purchasePriceDzd)))
  }

  const handleSubmit = async () => {
    if (!target || !destId) return
    const occurredAt = date ? toAlgeriaDayBoundaryIso(date, "start") : undefined
    const noteVal = note.trim() || null

    if (target.type === "ASSET") {
      const parsedAmount = parseChargeAmountInput(chargeAmount)
      // An invalid non-blank amount never silently becomes a free placement:
      // block the submit and let the rendered error tell the operator. Blank
      // means "use the server default"; an explicit 0 is a free placement.
      let chargeAmountDzd: number | null = null
      if (destType === "PROJECT") {
        if (parsedAmount.kind === "invalid") {
          return
        }

        chargeAmountDzd = parsedAmount.kind === "default" ? null : parsedAmount.value
      }

      await assetMutation.mutateAsync({
        assetUnitId: target.assetUnitId,
        toWarehouseId: destType === "WAREHOUSE" ? destId : null,
        toProjectId: destType === "PROJECT" ? destId : null,
        chargeAmountDzd,
        note: noteVal,
        occurredAt,
      })
    } else {
      const qty = Number(quantity)
      if (!Number.isFinite(qty) || qty <= 0) return
      await consumableMutation.mutateAsync({
        inventoryEntryId: target.inventoryEntryId,
        quantity: qty,
        fromWarehouseId: target.sourceWarehouseId ?? null,
        fromProjectId: target.sourceProjectId ?? null,
        toWarehouseId: destType === "WAREHOUSE" ? destId : null,
        toProjectId: destType === "PROJECT" ? destId : null,
        note: noteVal,
        occurredAt,
      })
    }

    resetForm()
    onOpenChange(false)
  }

  const destOptions = destType === "WAREHOUSE" ? warehouses : projects

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.transfer.title")}</DialogTitle>
          {target ? (
            <p className="text-sm text-muted-foreground" dir="auto">
              {target.type === "ASSET" ? target.assetName : target.itemName}
            </p>
          ) : null}
        </DialogHeader>

        <div className="space-y-4">
          {target?.type === "CONSUMABLE" ? (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("inventory.transfer.quantity")}</span>
              <div className="flex items-center gap-2">
                <input
                  className={formInputClassName}
                  type="number"
                  min="1"
                  max={target.availableQuantity}
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t("inventory.transfer.of")} {target.availableQuantity}
                </span>
              </div>
            </label>
          ) : null}

          <div className="flex gap-2">
            <label className="flex flex-col gap-2 flex-1">
              <span className="text-sm font-medium">{t("inventory.transfer.destType")}</span>
              <NativeSelect
                value={destType}
                onChange={(e) => {
                  setDestType(e.target.value as "WAREHOUSE" | "PROJECT")
                  setDestId("")
                }}
              >
                <option value="WAREHOUSE">{t("inventory.transfer.warehouse")}</option>
                <option value="PROJECT">{t("inventory.transfer.project")}</option>
              </NativeSelect>
            </label>

            <label className="flex flex-col gap-2 flex-[2]">
              <span className="text-sm font-medium">{t("inventory.transfer.destination")}</span>
              <NativeSelect
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
              >
                <option value="">{t("inventory.transfer.selectDest")}</option>
                {destOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          {asksForCharge ? (
            <div className="space-y-2 rounded-lg border border-line p-3" data-testid="charge-fields">
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-2">
                  <span className="text-sm font-medium">{t("inventory.transfer.chargeAmount")}</span>
                  <input
                    className={formInputClassName}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={t("inventory.transfer.chargeAmount")}
                    aria-invalid={chargeInvalid}
                    value={chargeAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                  />
                </label>

                <label className="flex flex-1 flex-col gap-2">
                  <span className="text-sm font-medium">{t("inventory.transfer.chargePercent")}</span>
                  <input
                    className={formInputClassName}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={t("inventory.transfer.chargePercent")}
                    disabled={!hasPurchasePrice || chargeDefaultUnavailable}
                    value={chargePercent}
                    onChange={(e) => handlePercentChange(e.target.value)}
                  />
                </label>
              </div>

              {chargeDefaultUnavailable ? (
                <p
                  className="text-xs text-amber-600"
                  role="alert"
                  data-testid="charge-default-error"
                >
                  {t("inventory.transfer.chargePriceUnavailable")}
                </p>
              ) : chargePricePending ? (
                <p className="text-xs text-muted-foreground">
                  {t("inventory.transfer.chargePriceLoading")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("inventory.transfer.chargeHint", { price: purchasePriceDzd })}
                </p>
              )}

              {chargeInvalid ? (
                <p className="text-xs text-destructive" role="alert" data-testid="charge-error">
                  {t("inventory.transfer.chargeInvalid")}
                </p>
              ) : null}

              {warnsAbovePurchase ? (
                <p className="text-xs text-amber-600" data-testid="charge-warning">
                  {t("inventory.transfer.chargeAboveWarning")}
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.paymentDate")}</span>
            <DatePicker value={date} onChange={setDate} />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.notes")}</span>
            <Textarea
              placeholder={t("common.noNotes")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button disabled={!destId || isPending || chargeRequired} onClick={handleSubmit}>
            {t("inventory.transfer.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
