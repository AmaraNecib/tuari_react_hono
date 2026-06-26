import { useCallback, useEffect, useMemo, useState } from "react"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  useDebtEntriesConsolidateMutation,
} from "@/features/app-shell/mock-dashboard"
import { formatDebtMoney, getDebtBalanceMeta, getDebtDirectionLabel } from "./debt-utils"
import { cn } from "@/lib/utils"

export function ConsolidationDialog({
  payableAccount,
  receivableAccount,
  payableEntries,
  receivableEntries,
  open,
  onOpenChange,
}: {
  payableAccount: DebtAccount
  receivableAccount: DebtAccount
  payableEntries: DebtEntry[]
  receivableEntries: DebtEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const consolidateMutation = useDebtEntriesConsolidateMutation()
  const [selectedPayableId, setSelectedPayableId] = useState("")
  const [selectedReceivableId, setSelectedReceivableId] = useState("")

  const livePayableOpenings = useMemo(
    () =>
      payableEntries.filter(
        (e) => e.status === "LIVE" && e.entryType === "OPENING",
      ),
    [payableEntries],
  )

  const liveReceivableOpenings = useMemo(
    () =>
      receivableEntries.filter(
        (e) => e.status === "LIVE" && e.entryType === "OPENING",
      ),
    [receivableEntries],
  )

  const livePayableIds = useMemo(
    () => new Set(livePayableOpenings.map((e) => e.id)),
    [livePayableOpenings],
  )

  const liveReceivableIds = useMemo(
    () => new Set(liveReceivableOpenings.map((e) => e.id)),
    [liveReceivableOpenings],
  )

  // Reset stale selections when the chosen entry is no longer live
  useEffect(() => {
    if (selectedPayableId && !livePayableIds.has(selectedPayableId)) {
      setSelectedPayableId("")
    }
  }, [livePayableIds, selectedPayableId])

  useEffect(() => {
    if (selectedReceivableId && !liveReceivableIds.has(selectedReceivableId)) {
      setSelectedReceivableId("")
    }
  }, [liveReceivableIds, selectedReceivableId])

  // Reset on dialog open
  useEffect(() => {
    if (open) {
      setSelectedPayableId("")
      setSelectedReceivableId("")
    }
  }, [open])

  const selectedPayable = useMemo(
    () => payableEntries.find((e) => e.id === selectedPayableId) ?? null,
    [payableEntries, selectedPayableId],
  )

  const selectedReceivable = useMemo(
    () => receivableEntries.find((e) => e.id === selectedReceivableId) ?? null,
    [receivableEntries, selectedReceivableId],
  )

  const payableAmount = selectedPayable ? Math.abs(selectedPayable.signedAmountDzd) : 0
  const receivableAmount = selectedReceivable ? Math.abs(selectedReceivable.signedAmountDzd) : 0
  const netAmount = payableAmount - receivableAmount
  const canConsolidate = selectedPayableId !== "" && selectedReceivableId !== "" && selectedPayableId !== selectedReceivableId

  const consolidationPreview = useMemo(() => {
    if (!selectedPayable || !selectedReceivable) return null

    if (payableAmount === receivableAmount) {
      return {
        description: "سيتم إلغاء الحركتين بالكامل. لا يبقى رصيد.",
        label: "إلغاء تام",
      }
    }

    if (netAmount > 0) {
      return {
        description: `يبقى رصيد ${formatDebtMoney(netAmount)} دج على حساب ${getDebtDirectionLabel(payableAccount.direction)}.`,
        label: `يبقى ${formatDebtMoney(netAmount)} دج`,
      }
    }

    return {
      description: `يبقى رصيد ${formatDebtMoney(-netAmount)} دج على حساب ${getDebtDirectionLabel(receivableAccount.direction)}.`,
      label: `يبقى ${formatDebtMoney(-netAmount)} دج`,
    }
  }, [selectedPayable, selectedReceivable, payableAmount, receivableAmount, netAmount, payableAccount.direction, receivableAccount.direction])

  const handleSubmit = useCallback(async () => {
    if (!canConsolidate) return

    try {
      await consolidateMutation.mutateAsync({
        payableEntryId: selectedPayableId,
        receivableEntryId: selectedReceivableId,
      })
      onOpenChange(false)
    } catch {
      // Error is handled by the mutation's onError callback (toast).
      // Dialog stays open so the user can retry or change selections.
    }
  }, [canConsolidate, consolidateMutation, selectedPayableId, selectedReceivableId, onOpenChange])

  const hasMultiplePayableOptions = livePayableOpenings.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تجميد الديون</DialogTitle>
          <DialogDescription>
            اختر حركة افتتاحية من كل جانب لتجميدهما. سيتم إلغاء الحركتين الأصليتين وإنشاء رصيد افتتاحي جديد بالصافي.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Payable side */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              {getDebtDirectionLabel(payableAccount.direction)} — رصيد الحساب: دج{" "}
              {formatDebtMoney(payableAccount.currentBalance)}
            </h4>
            {livePayableOpenings.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد حركات افتتاحية نشطة.</p>
            ) : (
              <div className="space-y-2">
                {livePayableOpenings.map((entry) => {
                  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd)
                  const isSelected = selectedPayableId === entry.id

                  return (
                    <button
                      key={entry.id}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-start transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-primary/40",
                      )}
                      disabled={hasMultiplePayableOptions && isSelected}
                      onClick={() => setSelectedPayableId(entry.id)}
                      type="button"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}
                        </p>
                        {entry.note?.trim() && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{entry.note.trim()}</p>
                        )}
                      </div>
                      <span className={cn("font-mono text-base font-semibold", amountMeta.textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.signedAmountDzd)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Receivable side */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              {getDebtDirectionLabel(receivableAccount.direction)} — رصيد الحساب: دج{" "}
              {formatDebtMoney(receivableAccount.currentBalance)}
            </h4>
            {liveReceivableOpenings.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد حركات افتتاحية نشطة.</p>
            ) : (
              <div className="space-y-2">
                {liveReceivableOpenings.map((entry) => {
                  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd)
                  const isSelected = selectedReceivableId === entry.id

                  return (
                    <button
                      key={entry.id}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-start transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-primary/40",
                      )}
                      onClick={() => setSelectedReceivableId(entry.id)}
                      type="button"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}
                        </p>
                        {entry.note?.trim() && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{entry.note.trim()}</p>
                        )}
                      </div>
                      <span className={cn("font-mono text-base font-semibold", amountMeta.textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.signedAmountDzd)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          {selectedPayable && selectedReceivable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {consolidationPreview?.label ?? ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDebtMoney(payableAmount)} دج ← {formatDebtMoney(receivableAmount)} دج
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {consolidationPreview?.description ?? ""}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            disabled={!canConsolidate || consolidateMutation.isPending}
            onClick={handleSubmit}
          >
            {consolidateMutation.isPending ? "جاري التجميد..." : "تأكيد التجميد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
