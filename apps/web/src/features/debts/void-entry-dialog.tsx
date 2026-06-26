import { useState, useEffect, useMemo } from "react"
import type { DebtEntry } from "@tuari/contracts"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/form-controls"
import { useVoidDebtEntryMutation } from "@/features/app-shell/mock-dashboard"
import { formatDebtMoney, getDebtBalanceMeta } from "./debt-utils"
import { cn } from "@/lib/utils"

export function VoidEntryDialog({
  entry,
  livePaymentEntries,
  open,
  onOpenChange,
}: {
  entry: DebtEntry | null
  /** All LIVE PAYMENT entries on the same account (for cascade warning) */
  livePaymentEntries: DebtEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const voidEntryMutation = useVoidDebtEntryMutation()
  const [voidReason, setVoidReason] = useState("")
  const [cascadeConfirmed, setCascadeConfirmed] = useState(false)

  const hasLivePayments = entry?.entryType === "OPENING" && livePaymentEntries.length > 0
  const totalCascadeAmount = useMemo(
    () => livePaymentEntries.reduce((sum, e) => sum + Math.abs(e.signedAmountDzd), 0),
    [livePaymentEntries],
  )
  const reasonIsValid = voidReason.trim().length > 0
  const canSubmit = reasonIsValid && (!hasLivePayments || cascadeConfirmed)

  useEffect(() => {
    if (open) {
      setVoidReason("")
      setCascadeConfirmed(false)
    }
  }, [open])

  if (!entry) return null

  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd)

  const handleSubmit = async () => {
    if (!canSubmit) return

    await voidEntryMutation.mutateAsync({
      entryId: entry.id,
      voidReason: voidReason.trim(),
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إلغاء حركة الدين</DialogTitle>
          <DialogDescription>
            سيتم إلغاء الحركة وتعيين حالتها إلى "ملغية".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry summary */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {entry.entryType === "OPENING" ? "رصيد افتتاحي" : "دفعة"}
              </span>
              <span className={cn("font-mono text-lg font-semibold", amountMeta.textClassName)} dir="ltr">
                دج {formatDebtMoney(entry.signedAmountDzd)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}
              {entry.note?.trim() ? ` — ${entry.note.trim()}` : ""}
            </p>
          </div>

          {/* Cascade warning for OPENING void */}
          {hasLivePayments && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                تحذير: إلغاء الرصيد الافتتاحي
              </p>
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-400">
                سيتم إلغاء {livePaymentEntries.length} دفعة مرتبطة تلقائياً
                بقيمة إجمالية {formatDebtMoney(totalCascadeAmount)} دج.
              </p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={cascadeConfirmed}
                  onChange={(e) => setCascadeConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border/80"
                />
                <span className="text-sm text-amber-800 dark:text-amber-400">
                  أفهم أنه سيتم إلغاء جميع الدفعات المرتبطة تلقائياً.
                </span>
              </label>
            </div>
          )}

          {/* Void reason */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              سبب الإلغاء <span className="text-rose-500">*</span>
            </span>
            <Textarea
              placeholder="اذكر سبب إلغاء هذه الحركة"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
            {!reasonIsValid && voidReason.trim().length === 0 && voidReason.length > 0 && (
              <p className="text-xs text-rose-600">يرجى كتابة سبب الإلغاء.</p>
            )}
          </label>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            رجوع
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit || voidEntryMutation.isPending}
            onClick={handleSubmit}
          >
            {voidEntryMutation.isPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
