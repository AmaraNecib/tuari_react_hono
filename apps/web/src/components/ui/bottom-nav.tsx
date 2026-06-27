import { useTranslation } from "react-i18next"
import { Gauge, Users, Warehouse, FileText, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { WorkspaceLink, workspaceRoutes, type WorkspaceRouteTarget } from "@/router/navigation"

/**
 * Bottom navigation item interface.
 */
interface BottomNavItem {
  key: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  target: WorkspaceRouteTarget
}

/**
 * Bottom navigation props interface.
 */
interface BottomNavProps {
  currentPage: string
  className?: string
}

/**
 * Bottom navigation bar for mobile devices.
 * Shows main navigation items with icons and labels.
 */
/**
 * @description Component
 */
export function BottomNav({ currentPage, className }: BottomNavProps) {
  const { t } = useTranslation()

  const items: BottomNavItem[] = [
    { key: "dashboard", label: t("shell.dashboard"), icon: Gauge, target: workspaceRoutes.dashboard() },
    { key: "employees", label: t("shell.employees"), icon: Users, target: workspaceRoutes.employees() },
    { key: "warehouses", label: t("shell.warehouses"), icon: Warehouse, target: workspaceRoutes.warehouses() },
    { key: "invoices", label: t("shell.invoices"), icon: FileText, target: workspaceRoutes.invoices() },
    { key: "settings", label: t("shell.settings"), icon: Settings, target: workspaceRoutes.settings() },
  ]

  return (
    <nav className={cn("bottom-nav", className)} aria-label={t("shell.mainNavigation")}>
      {items.map((item) => {
        const isActive = currentPage === item.key || currentPage.startsWith(item.key)
        const Icon = item.icon

        return (
          <WorkspaceLink
            key={item.key}
            className="bottom-nav-item"
            data-active={isActive ? "true" : undefined}
            target={item.target}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </WorkspaceLink>
        )
      })}
    </nav>
  )
}
