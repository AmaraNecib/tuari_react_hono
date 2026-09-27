import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

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

/** The amount implied by a percentage of the purchase price. */
export function chargeAmountFromPercent(percent: number, purchasePriceDzd: number): number {
  if (!Number.isFinite(purchasePriceDzd) || !Number.isFinite(percent)) {
    return 0
  }

  return roundMoney(purchasePriceDzd * (1 + percent / 100))
}

/** Parse the amount field; blank or invalid means a free placement (0). */
export function parseChargeAmountInput(value: string): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return 0
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
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
  const [note, setNote] = useState("")
  const [date, setDate] = useState(() => getAlgeriaDateInputValue())

  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const isPending = assetMutation.isPending || consumableMutation.isPending

  const purchasePriceDzd = chargeDefault.data?.purchasePriceDzd ?? 0
  const isAsset = target?.type === "ASSET"
  const asksForCharge = isAsset && destType === "PROJECT"
  const amountValue = parseChargeAmountInput(chargeAmount)
  const warnsAbovePurchase = purchasePriceDzd > 0 && amountValue > purchasePriceDzd

  // Prefill from the resolved default (last charge for the unit, else its
  // purchase price) whenever the dialog opens for an asset.
  useEffect(() => {
    if (!open || target?.type !== "ASSET") return
    const defaultAmount = chargeDefault.data?.amountDzd
    if (defaultAmount === undefined) return
    setChargeAmount(String(defaultAmount))
    const percent = chargePercentFromAmount(defaultAmount, chargeDefault.data!.purchasePriceDzd)
    setChargePercent(percent === null ? "" : String(percent))
  }, [open, target, chargeDefault.data])

  const resetForm = () => {
    setDestType("WAREHOUSE")
    setDestId("")
    setQuantity("1")
    setChargeAmount("")
    setChargePercent("")
    setNote("")
    setDate(getAlgeriaDateInputValue())
  }

  const handleAmountChange = (value: string) => {
    setChargeAmount(value)
    const percent = chargePercentFromAmount(parseChargeAmountInput(value), purchasePriceDzd)
    setChargePercent(percent === null ? "" : String(percent))
  }

  const handlePercentChange = (value: string) => {
    setChargePercent(value)
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
      await assetMutation.mutateAsync({
        assetUnitId: target.assetUnitId,
        toWarehouseId: destType === "WAREHOUSE" ? destId : null,
        toProjectId: destType === "PROJECT" ? destId : null,
        chargeAmountDzd: destType === "PROJECT" ? amountValue : null,
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
                    disabled={purchasePriceDzd <= 0}
                    value={chargePercent}
                    onChange={(e) => handlePercentChange(e.target.value)}
                  />
                </label>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("inventory.transfer.chargeHint", { price: purchasePriceDzd })}
              </p>

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
          <Button disabled={!destId || isPending} onClick={handleSubmit}>
            {t("inventory.transfer.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
