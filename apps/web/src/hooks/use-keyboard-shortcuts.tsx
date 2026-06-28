import { useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface KeyboardShortcuts {
  /** Open search (Ctrl+K or Cmd+K) */
  onSearch?: () => void
  /** Create new item (Ctrl+N or Cmd+N) */
  onNew?: () => void
  /** Save current form (Ctrl+S or Cmd+S) */
  onSave?: () => void
  /** Delete selected item (Delete or Backspace) */
  onDelete?: () => void
  /** Go back (Escape) */
  onBack?: () => void
  /** Open help (? key) */
  onHelp?: () => void
  /** Toggle sidebar (Ctrl+B or Cmd+B) */
  onToggleSidebar?: () => void
  /** Close modal/dialog (Escape) */
  onClose?: () => void
}

/**
 * Global keyboard shortcuts hook.
 * Registers keyboard shortcuts for common actions.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable

      // Don't trigger shortcuts when typing in inputs (except specific ones)
      if (isInput) {
        // Allow Escape in inputs
        if (event.key === "Escape" && shortcuts.onClose) {
          shortcuts.onClose()
        }
        return
      }

      const isMod = event.metaKey || event.ctrlKey
      const isShift = event.shiftKey

      // Ctrl/Cmd + K: Search (works in Brave/Firefox)
      // Alt + K: Search fallback (Chrome intercepts Ctrl+K for Google search)
      if ((isMod && event.key === "k") || (event.altKey && event.key === "k")) {
        event.preventDefault()
        shortcuts.onSearch?.()
        return
      }

      // Ctrl/Cmd + Shift + N: New (Ctrl+N is intercepted by browsers for new window)
      if (isMod && isShift && event.key === "N") {
        event.preventDefault()
        shortcuts.onNew?.()
        return
      }

      // Ctrl/Cmd + S: Save (safe — no browser conflict)
      if (isMod && event.key === "s") {
        event.preventDefault()
        shortcuts.onSave?.()
        return
      }

      // Ctrl/Cmd + Shift + B: Toggle sidebar (Ctrl+B opens browser sidebar in Brave/Chrome)
      if (isMod && isShift && event.key === "B") {
        event.preventDefault()
        shortcuts.onToggleSidebar?.()
        return
      }

      // ?: Open help
      if (event.key === "?") {
        event.preventDefault()
        shortcuts.onHelp?.()
        return
      }

      // Escape: Close/Back
      if (event.key === "Escape") {
        if (shortcuts.onClose) {
          shortcuts.onClose()
        } else {
          shortcuts.onBack?.()
        }
        return
      }

      // Delete/Backspace: Delete (when not in input)
      if (event.key === "Delete" || event.key === "Backspace") {
        shortcuts.onDelete?.()
        return
      }
    },
    [shortcuts],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}

interface ShortcutHintProps {
  shortcut: string[]
  description: string
  className?: string
}

/**
 * Displays keyboard shortcut hint.
 */
/**
 * @description Component
 */
export function ShortcutHint({ shortcut, description, className }: ShortcutHintProps) {
  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span>{description}</span>
      <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {shortcut.join(" + ")}
      </kbd>
    </div>
  )
}
