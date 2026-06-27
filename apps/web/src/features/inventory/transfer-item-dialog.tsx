import { useState } from "react"
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

export type TransferTarget = TransferAssetTarget | TransferConsumableTarget

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

  const [destType, setDestType] = useState<"WAREHOUSE" | "PROJECT">("WAREHOUSE")
  const [destId, setDestId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [note, setNote] = useState("")
  const [date, setDate] = useState(() => getAlgeriaDateInputValue())

  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const isPending = assetMutation.isPending || consumableMutation.isPending

  const resetForm = () => {
    setDestType("WAREHOUSE")
    setDestId("")
    setQuantity("1")
    setNote("")
    setDate(getAlgeriaDateInputValue())
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
