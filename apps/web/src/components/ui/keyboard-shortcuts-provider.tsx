import { createContext, useContext, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useKeyboardShortcuts, type ShortcutDefinition } from "@/lib/keyboard-shortcuts"

interface KeyboardShortcutsContextValue {
  registerShortcut: (key: string, handler: () => void) => void
  unregisterShortcut: (key: string) => void
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null)

interface KeyboardShortcutsProviderProps {
  children: ReactNode
  /** Shortcut definitions (optional - defaults to empty) */
  shortcuts?: ShortcutDefinition[]
}

/**
 * Global keyboard shortcuts provider.
 * Registers keyboard shortcuts and provides context for dynamic shortcuts.
 */
export function KeyboardShortcutsProvider({
  children,
  shortcuts,
}: KeyboardShortcutsProviderProps) {
  useKeyboardShortcuts(shortcuts)

  return (
    <KeyboardShortcutsContext.Provider value={{ registerShortcut: () => {}, unregisterShortcut: () => {} }}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

/**
 * Hook to access keyboard shortcuts context.
 */
/**
 * Hook to access keyboard shortcuts context.
 * Must be used within KeyboardShortcutsProvider.
 */
export function useKeyboardShortcutsContext() {
  const context = useContext(KeyboardShortcutsContext)
  if (!context) {
    throw new Error("useKeyboardShortcutsContext must be used within KeyboardShortcutsProvider")
  }
  return context
}

interface KeyboardShortcutsHelpProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Additional className */
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
 */
/**
 * @description Component
 */
export function KeyboardShortcutsHelp({ isOpen, onClose, className }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation()
  const shortcuts = useShortcuts()

  if (!isOpen) return null

  const categories = [
    { key: "general", label: t("shortcuts.categoryGeneral") },
    { key: "navigation", label: t("shortcuts.categoryNavigation") },
    { key: "editing", label: t("shortcuts.categoryEditing") },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className={`w-full max-w-md rounded-xl border border-line bg-card p-6 shadow-lg ${className ?? ""}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("shortcuts.title")}</h2>
          <button
            type="button"
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-surface-2"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

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
                            className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
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

        <div className="mt-4 text-center">
          <button
            type="button"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  )
}
