/**
 * Workspace sidebar navigation component.
 * Provides main navigation for the application.
 */
import {
  BriefcaseBusiness,
  Boxes,
  Gauge,
  HandCoins,
  Logs,
  ReceiptText,
  FileText,
  UserSquare2,
  Users,
  Warehouse,
  Settings,
} from "lucide-react"
import type React from "react"
import { useTranslation } from "react-i18next"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { WorkspaceLink, workspaceRoutes, type WorkspaceRouteTarget } from "@/router/navigation"

type WorkspaceSidebarPage =
  | "dashboard"
  | "employees"
  | "employees-create"
  | "employee-details"
  | "employee-edit"
  | "debts"
  | "debt-create"
  | "externals"
  | "projects"
  | "salaries"
  | "project-details"
  | "project-create"
  | "project-edit"
  | "external-create"
  | "external-details"
  | "transactions"
  | "warehouses"
  | "warehouse-details"
  | "warehouse-create"
  | "warehouse-edit"
  | "inventory"
  | "invoices"
  | "invoice-create"
  | "invoice-details"
  | "outbound-transfers"
  | "outbound-transfer-create"
  | "outbound-transfer-create-v2"
  | "transfer-history"
  | "roles"
  | "settings"

type WorkspaceSidebarProps = {
  collapsed: boolean
  collapseLabel: string
  currentPage: WorkspaceSidebarPage
  dashboardLabel: string
  debtsLabel: string
  employeesLabel: string
  externalsLabel: string
  expandLabel: string
  projectsLabel: string
  inventoryLabel: string
  invoicesLabel: string
  transferHistoryLabel: string
  salariesLabel: string
  rolesLabel: string
  transactionsLabel: string
  session: { name: string | null; phone: string }
  warehousesLabel: string
  width: string
  onSetCollapsed: (nextValue: boolean) => void
}

type NavItem = {
  key: WorkspaceSidebarPage
  target: WorkspaceRouteTarget
  Icon: React.ComponentType<{ size?: number; className?: string }>
}

type NavGroup = {
  labelKey: string
  fallback: string
  items: NavItem[]
}

const ACTIVE_KEY_MAP: Partial<Record<WorkspaceSidebarPage, WorkspaceSidebarPage>> = {
  "employees-create": "employees",
  "employee-details": "employees",
  "employee-edit":    "employees",
  "debt-create":      "debts",
  "external-create":  "externals",
  "external-details": "externals",
  "project-create":   "projects",
  "project-details":  "projects",
  "project-edit":     "projects",
  "warehouse-create": "warehouses",
  "warehouse-details":"warehouses",
  "warehouse-edit":   "warehouses",
  "invoice-create":   "invoices",
  "invoice-details":  "invoices",
  "outbound-transfers":          "inventory",
  "outbound-transfer-create":    "inventory",
  "outbound-transfer-create-v2": "inventory",
  "transfer-history":            "transfer-history",
}

function getInitials(name: string | null): string {
  if (!name) return "؟"
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

/**
 * @description Component
 */
export function WorkspaceSidebar({
  collapsed,
  currentPage,
  dashboardLabel,
  debtsLabel,
  employeesLabel,
  externalsLabel,
  inventoryLabel,
  invoicesLabel,
  projectsLabel,
  salariesLabel,
  transactionsLabel,
  transferHistoryLabel,
  warehousesLabel,
  session,
  onSetCollapsed,
}: WorkspaceSidebarProps) {
  const { t } = useTranslation()
  const activeKey: WorkspaceSidebarPage = ACTIVE_KEY_MAP[currentPage] ?? currentPage

  const labels: Record<string, string> = {
    dashboard:         dashboardLabel,
    debts:             debtsLabel,
    employees:         employeesLabel,
    externals:         externalsLabel,
    inventory:         inventoryLabel,
    invoices:          invoicesLabel,
    projects:          projectsLabel,
    salaries:          salariesLabel,
    transactions:      transactionsLabel,
    "transfer-history": transferHistoryLabel,
    warehouses:        warehousesLabel,
    settings:          t("shell.settings"),
  }

  const groups: NavGroup[] = [
    {
      labelKey: "shell.navGroupOverview",
      fallback: "نظرة عامة",
      items: [{ key: "dashboard", target: workspaceRoutes.dashboard(), Icon: Gauge }],
    },
    {
      labelKey: "shell.navGroupOps",
      fallback: "العمليات",
      items: [
        { key: "projects",          target: workspaceRoutes.projects(),          Icon: BriefcaseBusiness },
        { key: "warehouses",        target: workspaceRoutes.warehouses(),        Icon: Warehouse },
        { key: "inventory",         target: workspaceRoutes.inventory(),         Icon: Boxes },
        { key: "salaries",          target: workspaceRoutes.salaries(),          Icon: ReceiptText },
      ],
    },
    {
      labelKey: "shell.navGroupFinance",
      fallback: "المالية",
      items: [
        { key: "invoices",          target: workspaceRoutes.invoices(),          Icon: FileText },
        { key: "debts",             target: workspaceRoutes.debts(),             Icon: HandCoins },
        { key: "transfer-history",  target: workspaceRoutes.transferHistory(),  Icon: Logs },
        { key: "transactions",      target: workspaceRoutes.transactions(),      Icon: Logs },
      ],
    },
    {
      labelKey: "shell.navGroupPeople",
      fallback: "الموظفون",
      items: [
        { key: "employees", target: workspaceRoutes.employees(), Icon: Users },
        { key: "externals", target: workspaceRoutes.externals(), Icon: UserSquare2 },
      ],
    },
    {
      labelKey: "shell.navGroupSystem",
      fallback: "النظام",
      items: [{ key: "settings", target: workspaceRoutes.settings(), Icon: Settings }],
    },
  ]

  return (
    <aside className="flex flex-col h-full bg-bg-2 border-e border-line overflow-hidden min-w-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 border-b border-line flex-shrink-0" style={{ height: "var(--header-h)" }}>
        <div className="w-[1.375rem] h-[1.375rem] rounded-[0.3125rem] bg-ink text-bg grid place-items-center text-sm font-display italic font-medium flex-shrink-0">
          ط
        </div>
        <span className="sb-collapse-hide font-display italic text-[1.1875rem] tracking-[-0.01em] whitespace-nowrap overflow-hidden">
          نظام
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-4" aria-label={t("shell.mainNavigation")}>
        {groups.map((group) => (
          <div key={group.labelKey}>
            {/* Group header */}
            <div className="sb-collapse-hide px-3 pb-1 pt-2 text-[0.6875rem] font-semibold tracking-wider uppercase text-ink-4">
              {t(group.labelKey, group.fallback)}
            </div>

            {/* Group items */}
            <div className="space-y-0.5">
              {group.items.map(({ key, target, Icon }) => {
                const active = activeKey === key
                const label = labels[key] ?? key

                const navItem = (
                  <WorkspaceLink
                    key={key}
                    className={cn(
                      "flex items-center gap-3 px-3 py-[0.375rem] rounded-[0.375rem] text-[0.875rem] cursor-pointer select-none transition-colors",
                      "relative",
                      active
                        ? "bg-surface text-ink font-medium shadow-[var(--shadow-sm)] sb-item-active"
                        : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                    target={target}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      size={16}
                      className={cn(
                        "flex-shrink-0 opacity-80",
                        active && "opacity-100 text-primary",
                      )}
                    />
                    <span className="sb-collapse-hide">{label}</span>
                  </WorkspaceLink>
                )

                if (collapsed) {
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger render={navItem} />
                      <TooltipContent side="left">{label}</TooltipContent>
                    </Tooltip>
                  )
                }

                return <div key={key}>{navItem}</div>
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: user info */}
      {collapsed ? (
        <div className="border-t border-line py-3 flex flex-col items-center gap-2 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <div
                  className="w-[1.625rem] h-[1.625rem] rounded-full grid place-items-center text-white text-[0.6875rem] font-semibold flex-shrink-0 bg-primary cursor-pointer"
                  onClick={() => onSetCollapsed(false)}
                />
              }
            >
              {getInitials(session.name)}
            </TooltipTrigger>
            <TooltipContent side="left">{session.name ?? session.phone}</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className="border-t border-line px-3 py-3 flex items-center gap-3 text-[0.8125rem] flex-shrink-0">
          <div
            className="w-[1.625rem] h-[1.625rem] rounded-full grid place-items-center text-white text-[0.6875rem] font-semibold flex-shrink-0 bg-primary"
          >
            {getInitials(session.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{session.name ?? session.phone}</div>
            <div className="text-ink-3 text-[0.75rem] truncate">{session.phone}</div>
          </div>
        </div>
      )}
    </aside>
  )
}

export type { WorkspaceSidebarPage }
