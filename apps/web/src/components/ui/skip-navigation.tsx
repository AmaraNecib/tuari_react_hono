import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface SkipNavigationProps {
  /** Target element ID to skip to */
  targetId?: string
  /** Additional className */
  className?: string
}

/**
 * Skip navigation link for keyboard users.
 * Allows screen reader and keyboard users to skip repetitive navigation.
 */
export function SkipNavigation({
  targetId = "main-content",
  className,
}: SkipNavigationProps) {
  const { t } = useTranslation()
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const target = document.getElementById(targetId)
    if (target) {
      target.focus()
      target.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:rounded-lg focus:border focus:border-primary focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg",
        className,
      )}
      onClick={handleClick}
    >
      {t("common.skipToContent")}
    </a>
  )
}

interface MainContentProps {
  /** Content */
  children: React.ReactNode
  /** Additional className */
  className?: string
}

/**
 * Main content wrapper with id for skip navigation.
 */
export function MainContent({ children, className }: MainContentProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn("outline-none", className)}
    >
      {children}
    </main>
  )
}
