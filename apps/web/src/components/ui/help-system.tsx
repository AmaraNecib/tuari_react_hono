import { useState } from "react"
import { HelpCircle, Search, BookOpen, Keyboard, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface HelpSystemProps {
  /** Additional className */
  className?: string
}

interface HelpArticle {
  id: string
  title: string
  content: string
  category: "getting-started" | "features" | "shortcuts" | "faq"
}

const defaultArticles: HelpArticle[] = [
  {
    id: "getting-started",
    title: "البدء السريع",
    content: "مرحباً بك في نظام طاري! هذا الدليل سيساعدك على البدء باستخدام النظام.",
    category: "getting-started",
  },
  {
    id: "employees",
    title: "إدارة الموظفين",
    content: "يمكنك إضافة وتعديل وحذف الموظفين من قسم الموظفين.",
    category: "features",
  },
  {
    id: "shortcuts",
    title: "اختصارات لوحة المفاتيح",
    content: "Ctrl+K: البحث | Ctrl+N: عنصر جديد | Ctrl+S: حفظ",
    category: "shortcuts",
  },
]

/**
 * In-product help system with searchable articles.
 * Provides contextual help and documentation.
 */
/**
 * Help system component with searchable articles and keyboard shortcuts.
 * Provides contextual help and documentation for the application.
 */
/**
 * @description Component
 */
export function HelpSystem({ className }: HelpSystemProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null)

  const filteredArticles = defaultArticles.filter(
    (article) =>
      article.title.includes(searchQuery) ||
      article.content.includes(searchQuery),
  )

  return (
    <>
      {/* Help trigger button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={() => setIsOpen(true)}
        aria-label="Help"
      >
        <HelpCircle size={18} />
      </Button>

      {/* Help panel */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg rounded-xl border border-line bg-card shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-lg font-semibold text-foreground">المساعدة</h2>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setIsOpen(false)
                  setSelectedArticle(null)
                  setSearchQuery("")
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {selectedArticle ? (
                /* Article view */
                <div className="space-y-4">
                  <button
                    type="button"
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                    onClick={() => setSelectedArticle(null)}
                  >
                    ← العودة للقائمة
                  </button>
                  <h3 className="text-lg font-medium text-foreground">
                    {selectedArticle.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedArticle.content}
                  </p>
                </div>
              ) : (
                /* Search and list */
                <div className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="ابحث في المساعدة..."
                      className="w-full rounded-lg border border-border/75 bg-background/82 py-2 ps-10 pe-3 text-sm text-foreground placeholder:text-muted-foreground/80 outline-none focus:border-primary/45 focus:ring-4 focus:ring-primary/10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Articles list */}
                  <div className="space-y-2">
                    {filteredArticles.map((article) => (
                      <button
                        key={article.id}
                        type="button"
                        className="w-full rounded-lg border border-line p-3 text-start hover:bg-surface-2 transition-colors"
                        onClick={() => setSelectedArticle(article)}
                      >
                        <div className="flex items-center gap-3">
                          {article.category === "getting-started" ? (
                            <BookOpen size={16} className="text-muted-foreground" />
                          ) : article.category === "shortcuts" ? (
                            <Keyboard size={16} className="text-muted-foreground" />
                          ) : (
                            <HelpCircle size={16} className="text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium text-foreground">
                            {article.title}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

interface KeyboardShortcutHintProps {
  /** Shortcut keys */
  keys: string[]
  /** Description of what the shortcut does */
  description: string
  /** Additional className */
  className?: string
}

/**
 * Shows keyboard shortcut hint near UI elements.
 */
/**
 * @description Component
 */
export function KeyboardShortcutHint({
  keys,
  description,
  className,
}: KeyboardShortcutHintProps) {
  return (
    <div
      className={cn(
        "hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex",
        className,
      )}
    >
      <span>{description}</span>
      <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {keys.join(" + ")}
      </kbd>
    </div>
  )
}
