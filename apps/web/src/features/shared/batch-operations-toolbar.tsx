import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface BatchOperation {
  id: string;
  label: string;
  icon?: string;
  variant?: "default" | "destructive" | "outline";
  requiresConfirmation?: boolean;
  disabled?: boolean;
  tooltip?: string;
}

interface BatchOperationsToolbarProps {
  selectCount: number;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  maxBatchSize?: number;
  operations: BatchOperation[];
  onToggleAll: () => void;
  onClearSelection: () => void;
  onOperation: (operationId: string) => void;
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  if (selectCount === 0) {
    return null;
  }

  const handleOperationClick = (op: BatchOperation) => {
    if (op.requiresConfirmation) {
      setConfirming(op.id);
    } else {
      onOperation(op.id);
    }
  };

  const handleConfirmOperation = (operationId: string) => {
    onOperation(operationId);
    setConfirming(null);
  };

  const confirmingOp = operations.find((op) => op.id === confirming);

  return (
    <div className="sticky bottom-0 left-0 right-0 space-y-3 border-t border-border/60 bg-background/95 p-4">
      {/* Confirmation Dialog */}
      {confirming && confirmingOp && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <span className="text-sm">
            هل أنت متأكد من {confirmingOp.label}؟ لا يمكن التراجع عن هذا الإجراء.
          </span>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleConfirmOperation(confirming)}
            >
              نعم، تابع
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(null)}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* Selection Summary */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={isAllSelected}
            onChange={onToggleAll}
            className="h-4 w-4 cursor-pointer"
          />
          <span className="font-medium">
            {selectCount} محدد
            {selectCount === maxBatchSize && ` (الحد الأقصى: ${maxBatchSize})`}
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
              {op.icon && <span className="mr-1">{op.icon}</span>}
              {op.label}
            </Button>
          ))}

          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
          >
            مسح التحديد
          </Button>
        </div>
      </div>

      {selectCount === maxBatchSize && (
        <p className="text-xs text-muted-foreground">
          تم الوصول إلى الحد الأقصى للبحث ({maxBatchSize} عنصر). قم بمسح التحديد لاختيار عناصر أخرى.
        </p>
      )}
    </div>
  );
}
