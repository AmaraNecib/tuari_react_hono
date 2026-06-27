import { useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface UndoableAction<T = unknown> {
  /** Unique identifier */
  id: string
  /** Action description */
  description: string
  /** Data to restore */
  data: T
  /** Duration in ms before undo expires (default: 5000) */
  duration?: number
}

interface UseUndoOptions<T = unknown> {
  /** Duration in ms before undo expires */
  defaultDuration?: number
  /** Callback to perform the undo */
  onUndo: (data: T) => Promise<void> | void
  /** Callback when undo expires */
  onExpire?: (data: T) => void
}

interface UseUndoReturn<T = unknown> {
  /** Show undo toast for an action */
  showUndo: (action: UndoableAction<T>) => void
  /** Manually undo the last action */
  undoLast: () => Promise<void>
  /** Whether there's an action to undo */
  canUndo: boolean
  /** Clear the pending undo */
  clearUndo: () => void
}

/**
 * Hook for undoable actions with toast notifications.
 * Shows a toast with undo button after destructive actions.
 */
/**
 * Hook for managing undo operations with toast notifications.
 * Provides undo functionality with automatic expiration.
 */
export function useUndo<T = unknown>({
  defaultDuration = 5000,
  onUndo,
  onExpire,
}: UseUndoOptions<T>): UseUndoReturn<T> {
  const [pendingAction, setPendingAction] = useState<UndoableAction<T> | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearUndo = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPendingAction(null)
  }, [])

  const showUndo = useCallback(
    (action: UndoableAction<T>) => {
      clearUndo()

      const duration = action.duration ?? defaultDuration
      setPendingAction(action)

      toast(action.description, {
        duration,
        action: {
          label: "تراجع",
          onClick: async () => {
            await onUndo(action.data)
            clearUndo()
          },
        },
        onDismiss: () => {
          onExpire?.(action.data)
          clearUndo()
        },
      })
    },
    [clearUndo, defaultDuration, onUndo, onExpire],
  )

  const undoLast = useCallback(async () => {
    if (pendingAction) {
      await onUndo(pendingAction.data)
      clearUndo()
    }
  }, [pendingAction, onUndo, clearUndo])

  return {
    showUndo,
    undoLast,
    canUndo: pendingAction !== null,
    clearUndo,
  }
}

interface UndoToastProps {
  /** Action description */
  description: string
  /** Undo handler */
  onUndo: () => void
  /** Duration in ms */
  duration?: number
}

/**
 * Undo toast component for showing undo notifications.
 */
/**
 * Undo toast component for showing undo notifications.
 * Displays a toast with an undo button for reversible actions.
 */
/**
 * @description Component
 */
export function UndoToast({ description, onUndo }: UndoToastProps) {
  const { t } = useTranslation()
  const [isVisible, setIsVisible] = useState(true)

  const handleUndo = () => {
    onUndo()
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg">
      <p className="flex-1 text-sm text-foreground">{description}</p>
      <Button size="sm" variant="ghost" onClick={handleUndo}>
        <Undo2 size={14} className="me-1" />
        {t("common.undo")}
      </Button>
    </div>
  )
}
