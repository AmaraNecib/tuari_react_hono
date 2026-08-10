import { useEffect, useCallback, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ============ Types ============

interface ShortcutDefinition {
  /** Key combination (e.g., "Ctrl+K", "Cmd+N", "Escape") */
  key: string
  /** Handler function */
  handler: () => void
  /** Whether this shortcut works in input fields */
  allowInInput?: boolean
}

interface KeyboardShortcutsProviderProps {
  children: ReactNode
  /** Shortcut definitions (optional - defaults to empty) */
  shortcuts?: ShortcutDefinition[]
}

/**
 * Parse a key combo string into components.
 */
function parseKeyCombo(combo: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean } {
  const parts = combo.toLowerCase().split("+").map(s => s.trim())
  return {
    key: parts.find(p => !["ctrl", "cmd", "meta", "shift", "alt"].includes(p)) || "",
    ctrl: parts.includes("ctrl") || parts.includes("cmd") || parts.includes("meta"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  }
}

/**
 * Check if a keyboard event matches a shortcut combo.
 * Rejects unexpected Ctrl/Cmd usage for shortcuts that don't require it.
 */
function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseKeyCombo(combo)
  const isMod = event.metaKey || event.ctrlKey
  
  // If shortcut requires a modifier, check it's present
  if (parsed.ctrl && !isMod) return false
  if (parsed.shift && !event.shiftKey) return false
  if (parsed.alt && !event.altKey) return false
  
  // Mod-key exclusivity: if shortcut does NOT require a modifier,
  // reject when Ctrl/Cmd IS held (prevents Ctrl+K from matching bare "K")
  if (!parsed.ctrl && isMod) return false
  // Same for Alt: if shortcut does NOT require Alt, reject when Alt IS held
  if (!parsed.alt && event.altKey) return false
  
  return event.key.toLowerCase() === parsed.key
}

/**
 * Check if the target is an input field.
 */
function isInputField(target: EventTarget | null): boolean {
  const el = target as HTMLElement
  return (
    el?.tagName === "INPUT" ||
    el?.tagName === "TEXTAREA" ||
    el?.tagName === "SELECT" ||
    el?.isContentEditable
  )
}

/**
 * Hook to register keyboard shortcuts.
 */
function useKeyboardShortcuts(shortcuts: ShortcutDefinition[] = []) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut.key)) {
        if (isInputField(event.target) && !shortcut.allowInInput) {
          continue
        }
        event.preventDefault()
        shortcut.handler()
        return
      }
    }
  }, [shortcuts])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}

/**
 * Global keyboard shortcuts provider.
 * Registers keyboard shortcuts and provides context for dynamic shortcuts.
 */
export function KeyboardShortcutsProvider({
  children,
  shortcuts = [],
}: KeyboardShortcutsProviderProps) {
  useKeyboardShortcuts(shortcuts)

  return <>{children}</>
}

// ============ Help Dialog ============

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
  className?: string
}

function useShortcuts() {
  const { t } = useTranslation()
  return [
    { keys: ["Ctrl", "K"], description: t("shortcuts.search"), category: "general" },
    { keys: ["Alt", "K"], description: t("shortcuts.searchAlt"), category: "general" },
    { keys: ["Ctrl", "Shift", "N"], description: t("shortcuts.newItem"), category: "general" },
    { keys: ["Ctrl", "S"], description: t("shortcuts.save"), category: "general" },
    { keys: ["Ctrl", "Shift", "B"], description: t("shortcuts.toggleSidebar"), category: "general" },
    { keys: ["?"], description: t("shortcuts.openHelp"), category: "general" },
    { keys: ["Esc"], description: t("shortcuts.closeBack"), category: "general" },
    { keys: ["Delete"], description: t("shortcuts.deleteSelected"), category: "editing" },
    { keys: ["Tab"], description: t("shortcuts.nextElement"), category: "navigation" },
    { keys: ["Shift", "Tab"], description: t("shortcuts.previousElement"), category: "navigation" },
    { keys: ["Enter"], description: t("shortcuts.confirmOpen"), category: "navigation" },
    { keys: ["Space"], description: t("shortcuts.selectDeselect"), category: "navigation" },
  ]
}

/**
 * Keyboard shortcuts help dialog.
 * Shows all available keyboard shortcuts.
 *
 * Built on the shared Base UI Dialog wrapper so it gets modal semantics
 * (role="dialog", aria-modal, focus trap, ESC-to-close, scroll lock) for
 * free (issue #275).
 */
export function KeyboardShortcutsHelp({ isOpen, onClose, className }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation()
  const shortcuts = useShortcuts()

  const categories = [
    { key: "general", label: t("shortcuts.categoryGeneral") },
    { key: "navigation", label: t("shortcuts.categoryNavigation") },
    { key: "editing", label: t("shortcuts.categoryEditing") },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-md", className)}>
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {categories.map((category) => {
            const categoryShortcuts = shortcuts.filter((s) => s.category === category.key)
            if (categoryShortcuts.length === 0) return null

            return (
              <div key={category.key}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  {category.label}
                </h3>
                <div className="space-y-1">
                  {categoryShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-surface-2"
                    >
                      <span className="text-sm text-foreground">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={key}
                            className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
