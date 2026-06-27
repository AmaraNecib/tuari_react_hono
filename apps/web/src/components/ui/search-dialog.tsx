import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Search, X, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SearchItem {
  id: string
  title: string
  description?: string
  category?: string
  action?: () => void
  /** Sub-items revealed on Tab/Enter */
  children?: SearchItem[]
}

interface SearchDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Called on every keystroke with the current query */
  onQueryChange: (query: string) => void
  /** Filtered search results */
  results?: SearchItem[]
  /** Additional className */
  className?: string
}

/**
 * Hierarchical search dialog triggered by Ctrl+K / Alt+K.
 * Supports Tab-to-expand sub-actions within entities.
 */
/**
 * @description Component
 */
export function SearchDialog({ isOpen, onClose, onQueryChange, results = [], className }: SearchDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedItem, setExpandedItem] = useState<SearchItem | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setActiveIndex(0)
      setExpandedItem(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0)
  }, [results.length])

  // Scroll active item into view
  useEffect(() => {
    const el = itemRefs.current.get(activeIndex)
    if (el) {
      el.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value)
      onQueryChange(value)
    },
    [onQueryChange],
  )

  // If we're in expanded view, show children instead of normal results
  const displayItems = expandedItem?.children ?? results
  const isExpanded = expandedItem !== null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isExpanded) {
        setExpandedItem(null)
        setActiveIndex(0)
      } else {
        onClose()
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % Math.max(displayItems.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + displayItems.length) % Math.max(displayItems.length, 1))
    } else if (e.key === "Tab") {
      e.preventDefault()
      const item = displayItems[activeIndex]
      if (item?.children && item.children.length > 0) {
        setExpandedItem(item)
        setQuery("")
        setActiveIndex(0)
      } else if (item?.action) {
        item.action()
        onClose()
      }
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = displayItems[activeIndex]
      if (item?.children && item.children.length > 0 && !isExpanded) {
        setExpandedItem(item)
        setQuery("")
        setActiveIndex(0)
      } else if (item?.action) {
        item.action()
        onClose()
      }
    }
  }

  const handleBack = () => {
    setExpandedItem(null)
    setQuery("")
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-[2px]">
      <div className={cn("w-full max-w-lg rounded-xl border border-line bg-card shadow-lg", className)}>
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          {isExpanded ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleBack}
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <Search size={18} className="text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExpanded ? `${expandedItem?.title} — ${t("search.placeholder")}` : t("search.placeholder")}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        {displayItems.length > 0 ? (
          <div ref={resultsRef} className="max-h-80 overflow-y-auto p-2">
            {displayItems.map((item, i) => (
              <button
                key={item.id}
                ref={(el) => { if (el) itemRefs.current.set(i, el); else itemRefs.current.delete(i) }}
                type="button"
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-start transition-colors",
                  i === activeIndex ? "bg-surface-2 text-foreground" : "hover:bg-surface-2",
                )}
                onClick={() => {
                  if (item.children && item.children.length > 0 && !isExpanded) {
                    setExpandedItem(item)
                    setQuery("")
                    setActiveIndex(0)
                  } else if (item.action) {
                    item.action()
                    onClose()
                  }
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{item.title}</div>
                    {item.description ? (
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    ) : null}
                  </div>
                  {item.children && item.children.length > 0 && !isExpanded ? (
                    <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      Tab
                    </kbd>
                  ) : null}
                </div>
                {item.category && !isExpanded ? (
                  <div className="mt-1 text-xs text-muted-foreground">{item.category}</div>
                ) : null}
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("search.noResults")}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("search.hint")}
          </div>
        )}

        {/* Footer hints */}
        <div className="border-t border-line px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("search.keyboardHint")}</span>
          <div className="flex gap-2">
            <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
            <span>{t("search.navigate")}</span>
            <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd>
            <span>{t("search.expand")}</span>
            <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
            <span>{t("search.open")}</span>
            <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px]">esc</kbd>
            <span>{t("search.close")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
