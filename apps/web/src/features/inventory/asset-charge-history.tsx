import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { formInputClassName } from "@/components/ui/form-controls"

import {
  useAssetChargesByUnitQuery,
  useUpdateAssetChargeMutation,
  useVoidAssetChargeMutation,
} from "./inventory-hooks"
import { parseChargeAmountInput } from "./transfer-item-dialog"

/**
 * The unit's charge chain (#413): project placements, newest first, with
 * corrected/voided entries marked and a past charge kept editable. Loaded
 * lazily when the row is expanded so a location with many assets does not fire
 * one request per asset up front.
 */
export function AssetChargeHistory({ assetUnitId }: { assetUnitId: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftAmount, setDraftAmount] = useState("")
  const [draftReason, setDraftReason] = useState("")
  const [editError, setEditError] = useState(false)
  const query = useAssetChargesByUnitQuery(expanded ? assetUnitId : undefined)
  const updateMutation = useUpdateAssetChargeMutation()
  const voidMutation = useVoidAssetChargeMutation()
  const charges = query.data?.items ?? []
  const isPending = updateMutation.isPending || voidMutation.isPending
  // Loading, error and a genuinely empty chain are three different states: an
  // empty list must never stand in for "still loading" or "the query failed".
  const isLoading = query.isPending && query.data === undefined
  const isLoadError = query.isError && query.data === undefined

  const startEdit = (chargeId: string, amountDzd: number) => {
    setEditingId(chargeId)
    setDraftAmount(String(amountDzd))
    setDraftReason("")
    setEditError(false)
  }

  const saveEdit = async (chargeId: string) => {
    // A correction has no "default": blank is not a valid new amount, and a
    // non-numeric draft must not be coerced to 0 by `Number("")`. Route it
    // through the same three-valued parser the transfer dialog uses, accept
    // only an explicit amount (0 is a free placement), and surface an error.
    const amountInput = parseChargeAmountInput(draftAmount)
    if (amountInput.kind !== "amount") {
      setEditError(true)
      return
    }

    setEditError(false)
    await updateMutation.mutateAsync({ chargeId, amountDzd: amountInput.value, reason: draftReason.trim() || null })
    setEditingId(null)
  }

  const voidCharge = async (chargeId: string) => {
    await voidMutation.mutateAsync({ chargeId, reason: draftReason.trim() || null })
    setEditingId(null)
  }

  return (
    <div className="mt-1">
      <Button size="xs" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setExpanded((value) => !value)}>
        {expanded ? t("inventory.chargeHistory.hide") : t("inventory.chargeHistory.show")}
      </Button>

      {expanded ? (
        <div className="mt-1 space-y-1" data-testid="asset-charge-history">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">{t("inventory.chargeHistory.loading")}</p>
          ) : isLoadError ? (
            <p className="text-xs text-destructive" role="alert">
              {t("inventory.chargeHistory.loadError")}
            </p>
          ) : charges.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("inventory.chargeHistory.empty")}</p>
          ) : null}
          {charges.map((charge) => {
            const isEditing = editingId === charge.id
            return (
              <div key={charge.id} className="rounded-md border border-line/60 px-2 py-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={charge.status === "VOID" ? "text-muted-foreground line-through" : ""}>
                    {charge.projectName ?? t("inventory.chargeHistory.project")} — {charge.amountDzd}
                  </span>
                  <span className="flex items-center gap-1">
                    {charge.revisions.length > 0 ? (
                      <span className="text-muted-foreground">{t("inventory.chargeHistory.corrected")}</span>
                    ) : null}
                    {charge.status === "LIVE" ? (
                      <>
                        <Button size="xs" variant="ghost" className="h-5 px-1 text-xs" onClick={() => startEdit(charge.id, charge.amountDzd)}>
                          {t("inventory.chargeHistory.edit")}
                        </Button>
                        <Button size="xs" variant="ghost" className="h-5 px-1 text-xs" disabled={isPending} onClick={() => void voidCharge(charge.id)}>
                          {t("inventory.chargeHistory.void")}
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("inventory.chargeHistory.voided")}</span>
                    )}
                  </span>
                </div>

                {charge.revisions.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 border-t border-line/50 pt-1" data-testid="charge-revisions">
                    {charge.revisions.map((revision) => (
                      <li key={revision.id} className="text-[11px] leading-4 text-muted-foreground">
                        <span>
                          {revision.newAmountDzd === null
                            ? t("inventory.chargeHistory.revisionVoid", { from: revision.previousAmountDzd })
                            : t("inventory.chargeHistory.revisionCorrected", {
                                from: revision.previousAmountDzd,
                                to: revision.newAmountDzd,
                              })}
                        </span>
                        <span> · {revision.actorLabel ?? t("inventory.chargeHistory.unknownActor")}</span>
                        <span> · {new Date(revision.createdAt).toLocaleString("ar-DZ")}</span>
                        {revision.reason ? <span> · {revision.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {isEditing ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <input
                      className={formInputClassName}
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={t("inventory.chargeHistory.newAmount")}
                      value={draftAmount}
                      onChange={(event) => setDraftAmount(event.target.value)}
                    />
                    <input
                      className={formInputClassName}
                      type="text"
                      aria-label={t("inventory.chargeHistory.reason")}
                      placeholder={t("inventory.chargeHistory.reason")}
                      value={draftReason}
                      onChange={(event) => setDraftReason(event.target.value)}
                    />
                    <Button size="xs" disabled={isPending} onClick={() => void saveEdit(charge.id)}>
                      {t("inventory.chargeHistory.save")}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => { setEditingId(null); setEditError(false) }}>
                      {t("common.cancel")}
                    </Button>
                    {editError ? (
                      <p className="w-full text-xs text-destructive" role="alert" data-testid="charge-edit-error">
                        {t("inventory.chargeHistory.invalidAmount")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
