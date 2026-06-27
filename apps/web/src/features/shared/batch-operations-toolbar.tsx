import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface BatchOperation {
  id: string
  label: string
  icon?: string
  variant?: "default" | "destructive" | "outline"
  requiresConfirmation?: boolean
  disabled?: boolean
  tooltip?: string
}

interface BatchOperationsToolbarProps {
  selectCount: number
  isAllSelected: boolean
  isPartiallySelected: boolean
  maxBatchSize?: number
  operations: BatchOperation[]
  onToggleAll: () => void
  onClearSelection: () => void
  onOperation: (operationId: string) => void
}

/** Toolbar for batch operations on selected rows. */
export function BatchOperationsToolbar({
  selectCount,
  isAllSelected,
  isPartiallySelected,
  maxBatchSize = 100,
  operations,
  onToggleAll,
  onClearSelection,
  onOperation,
}: BatchOperationsToolbarProps) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState<string | null>(null)
  const checkboxRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (checkboxRef.current) {
      // Base UI Checkbox handles indeterminate via data-indeterminate attribute
      // The checkbox component will handle this automatically
    }
  }, [isPartiallySelected])

  if (selectCount === 0) {
    return null
  }

  const handleOperationClick = (op: BatchOperation) => {
    if (op.requiresConfirmation) {
      setConfirming(op.id)
    } else {
      onOperation(op.id)
    }
  }

  const handleConfirmOperation = (operationId: string) => {
    onOperation(operationId)
    setConfirming(null)
  }

  const confirmingOp = operations.find((op) => op.id === confirming)

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 z-40 space-y-3 border-t border-border/60 bg-background/95 p-4 backdrop-blur-sm">
        {/* Selection Summary */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Checkbox
              ref={checkboxRef}
              checked={isAllSelected}
              indeterminate={isPartiallySelected}
              onCheckedChange={onToggleAll}
            />
            <span className="font-medium text-foreground">
              {t("batchOperations.selected", { count: selectCount })}
              {selectCount === maxBatchSize && (
                <span className="text-muted-foreground">
                  {" "}({t("batchOperations.maxReached", { max: maxBatchSize })})
                </span>
              )}
            </span>
          </div>

          {/* Operations */}
          <div className="flex flex-wrap gap-2">
            {operations.map((op) => (
              <Button
                key={op.id}
                size="sm"
                variant={op.variant || "outline"}
                disabled={op.disabled}
                onClick={() => handleOperationClick(op)}
                title={op.tooltip}
              >
                {op.icon && <span className="me-1">{op.icon}</span>}
                {op.label}
              </Button>
            ))}

            <Button
              size="sm"
              variant="ghost"
              onClick={onClearSelection}
            >
              {t("batchOperations.clearSelection")}
            </Button>
          </div>
        </div>

        {selectCount === maxBatchSize && (
          <p className="text-xs text-muted-foreground">
            {t("batchOperations.maxHint", { max: maxBatchSize })}
          </p>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("batchOperations.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("batchOperations.confirmDescription", { action: confirmingOp?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirming && handleConfirmOperation(confirming)}
            >
              {t("batchOperations.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
