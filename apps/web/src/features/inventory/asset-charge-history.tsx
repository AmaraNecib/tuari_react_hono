import { useId, useState } from "react"
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
  const panelId = useId()
  const [editing, setEditing] = useState<{ chargeId: string; amount: string; reason: string } | null>(null)
  const [voiding, setVoiding] = useState<{ chargeId: string; reason: string } | null>(null)
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
    setEditing({ chargeId, amount: String(amountDzd), reason: "" })
    setVoiding(null)
    setEditError(false)
  }

  const saveEdit = async () => {
    if (!editing) return
    // A correction has no "default": blank is not a valid new amount, and a
    // non-numeric draft must not be coerced to 0 by `Number("")`. Route it
    // through the same three-valued parser the transfer dialog uses, accept
    // only an explicit amount (0 is a free placement), and surface an error.
    const amountInput = parseChargeAmountInput(editing.amount)
    if (amountInput.kind !== "amount") {
      setEditError(true)
      return
    }

    setEditError(false)
    try {
      await updateMutation.mutateAsync({
        chargeId: editing.chargeId,
        amountDzd: amountInput.value,
        reason: editing.reason.trim() || null,
      })
    } catch {
      // The mutation's onError already surfaced the failure toast. Swallow the
      // rejection so the click handler never leaks an unhandled rejection; the
      // edit form stays open with the operator's input intact (#422 round 5).
      return
    }
    setEditing(null)
  }

  const startVoid = (chargeId: string) => {
    // The void reason lives in its own draft, keyed to the charge being voided:
    // a reason typed while correcting charge A can never be recorded on B.
    setEditing(null)
    setEditError(false)
    setVoiding({ chargeId, reason: "" })
  }

  const confirmVoid = async () => {
    if (!voiding) return
    try {
      await voidMutation.mutateAsync({ chargeId: voiding.chargeId, reason: voiding.reason.trim() || null })
    } catch {
      // Same shape as the correction path: onError toasted, the rejection is
      // swallowed here so it never escapes the click handler (#422 round 5).
      return
    }
    setVoiding(null)
  }

  return (
    <div className="mt-1">
      <Button
        size="xs"
        variant="ghost"
        className="h-6 px-2 text-xs"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? t("inventory.chargeHistory.hide") : t("inventory.chargeHistory.show")}
      </Button>

      {expanded ? (
        <div id={panelId} className="mt-1 space-y-1" data-testid="asset-charge-history">
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
            const isEditing = editing?.chargeId === charge.id
            const isVoiding = voiding?.chargeId === charge.id
            return (
              <div key={charge.id} className="rounded-md border border-line/60 px-2 py-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={charge.status === "VOID" ? "text-muted-foreground line-through" : ""}>
                    {charge.projectName ?? t("inventory.chargeHistory.project")} — {charge.amountDzd.toLocaleString("ar-DZ")}
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
                        <Button size="xs" variant="ghost" className="h-5 px-1 text-xs" disabled={isPending} data-testid={`void-${charge.id}`} onClick={() => startVoid(charge.id)}>
                          {t("inventory.chargeHistory.void")}
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("inventory.chargeHistory.voided")}</span>
                    )}
                  </span>
                </div>

                {charge.revisions.length > 0 ? (
                  <ul aria-label={t("inventory.chargeHistory.revisions")} className="mt-1 space-y-0.5 border-t border-line/50 pt-1" data-testid="charge-revisions">
                    {charge.revisions.map((revision) => (
                      <li key={revision.id} className="text-[11px] leading-4 text-muted-foreground">
                        <span>
                          {revision.newAmountDzd === null
                            ? t("inventory.chargeHistory.revisionVoid", { from: revision.previousAmountDzd.toLocaleString("ar-DZ") })
                            : t("inventory.chargeHistory.revisionCorrected", {
                                from: revision.previousAmountDzd.toLocaleString("ar-DZ"),
                                to: revision.newAmountDzd.toLocaleString("ar-DZ"),
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
                      value={editing.amount}
                      onChange={(event) => setEditing((current) => (current ? { ...current, amount: event.target.value } : current))}
                    />
                    <input
                      className={formInputClassName}
                      type="text"
                      aria-label={t("inventory.chargeHistory.reason")}
                      placeholder={t("inventory.chargeHistory.reason")}
                      value={editing.reason}
                      onChange={(event) => setEditing((current) => (current ? { ...current, reason: event.target.value } : current))}
                    />
                    <Button size="xs" disabled={isPending} onClick={() => void saveEdit()}>
                      {t("inventory.chargeHistory.save")}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => { setEditing(null); setEditError(false) }}>
                      {t("common.cancel")}
                    </Button>
                    {editError ? (
                      <p className="w-full text-xs text-destructive" role="alert" data-testid="charge-edit-error">
                        {t("inventory.chargeHistory.invalidAmount")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {isVoiding ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <input
                      className={formInputClassName}
                      type="text"
                      aria-label={t("inventory.chargeHistory.voidReason")}
                      placeholder={t("inventory.chargeHistory.reason")}
                      value={voiding.reason}
                      onChange={(event) => setVoiding((current) => (current ? { ...current, reason: event.target.value } : current))}
                    />
                    <Button size="xs" variant="destructive" disabled={isPending} data-testid={`confirm-void-${charge.id}`} onClick={() => void confirmVoid()}>
                      {t("inventory.chargeHistory.confirmVoid")}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setVoiding(null)}>
                      {t("common.cancel")}
                    </Button>
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
