import {
  BriefcaseBusiness,
  Gauge,
  HandCoins,
  LayoutGrid,
  LogOut,
  Logs,
  MoonStar,
  PanelRightClose,
  PanelRightOpen,
  ReceiptText,
  ShieldCheck,
  SunMedium,
  UserSquare2,
  Users,
  Warehouse,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { WorkspaceLink, workspaceRoutes } from "@/router/navigation"

type WorkspaceSidebarPage =
  | "dashboard"
  | "employees"
  | "employees-create"
  | "employee-details"
  | "employee-edit"
  | "debts"
  | "external-counterparties"
  | "projects"
  | "salaries"
  | "project-details"
  | "project-create"
  | "project-edit"
  | "external-counterparty-create"
  | "external-counterparty-details"
  | "transactions"
  | "warehouses"
  | "warehouse-details"
  | "warehouse-create"
  | "warehouse-edit"
  | "roles"
  | "settings"

type WorkspaceSidebarProps = {
  collapsed: boolean
  collapseLabel: string
  currentPage: WorkspaceSidebarPage
  dashboardLabel: string
  debtsLabel: string
  employeesLabel: string
  expandLabel: string
  projectsLabel: string
  salariesLabel: string
  rolesLabel: string
  transactionsLabel: string
  session: {
    name: string | null
    phone: string
  }
  settingsLabel: string
  signOutLabel: string
  theme: "dark" | "light"
  themeToggleLabel: string
  warehousesLabel: string
  width: string
  onSetCollapsed: (nextValue: boolean) => void
  onSignOut: () => void
  onToggleTheme: () => void
}

const items = [
  { key: "dashboard", target: workspaceRoutes.dashboard(), icon: Gauge },
  { key: "employees", target: workspaceRoutes.employees(), icon: Users },
  { key: "debts", target: workspaceRoutes.debts(), icon: HandCoins },
  { key: "projects", target: workspaceRoutes.projects(), icon: BriefcaseBusiness },
  { key: "salaries", target: workspaceRoutes.salaries(), icon: ReceiptText },
  { key: "warehouses", target: workspaceRoutes.warehouses(), icon: Warehouse },
  { key: "transactions", target: workspaceRoutes.transactions(), icon: Logs },
  { key: "roles", target: workspaceRoutes.roles(), icon: ShieldCheck },
] as const

const utilityButtonClassName = "h-11 w-full rounded-2xl transition-colors"
const collapsedButtonClassName = "justify-center px-0"
const expandedButtonClassName = "justify-start px-3"

export function WorkspaceSidebar({
  collapsed,
  collapseLabel,
  currentPage,
  dashboardLabel,
  debtsLabel,
  employeesLabel,
  expandLabel,
  projectsLabel,
  salariesLabel,
  rolesLabel,
  transactionsLabel,
  session,
  settingsLabel,
  signOutLabel,
  theme,
  themeToggleLabel,
  warehousesLabel,
  width,
  onSetCollapsed,
  onSignOut,
  onToggleTheme,
}: WorkspaceSidebarProps) {
  const { t } = useTranslation()
  const itemLabels = {
    dashboard: dashboardLabel,
    debts: debtsLabel,
    employees: employeesLabel,
    projects: projectsLabel,
    salaries: salariesLabel,
    warehouses: warehousesLabel,
    transactions: transactionsLabel,
    roles: rolesLabel,
  } as const

  const activeKey =
    currentPage === "employees-create" || currentPage === "employee-details" || currentPage === "employee-edit"
      ? "employees"
      : currentPage === "external-counterparties" || currentPage === "external-counterparty-create" || currentPage === "external-counterparty-details"
        ? "debts"
      : currentPage === "project-details" || currentPage === "project-create" || currentPage === "project-edit"
        ? "projects"
        : currentPage === "warehouse-details" || currentPage === "warehouse-create" || currentPage === "warehouse-edit"
          ? "warehouses"
          : currentPage

  function getNavClassName(active: boolean) {
    return cn(
      buttonVariants({ variant: active ? "secondary" : "ghost", size: "default" }),
      utilityButtonClassName,
      collapsed ? collapsedButtonClassName : expandedButtonClassName,
      active
        ? "border border-primary/15 bg-primary/10 text-primary shadow-[0_12px_24px_rgba(59,91,162,0.12)] hover:bg-primary/12"
        : "text-sidebar-foreground/88 hover:bg-background/70 hover:text-foreground",
    )
  }

  function getUtilityClassName(active = false) {
    return cn(
      buttonVariants({ variant: active ? "secondary" : "ghost", size: "default" }),
      utilityButtonClassName,
      collapsed ? collapsedButtonClassName : expandedButtonClassName,
      active ? "border border-primary/15 bg-primary/10 text-primary" : "text-sidebar-foreground/88 hover:bg-background/70 hover:text-foreground",
    )
  }

  return (
    <aside
      className="shell-sidebar fixed inset-y-0 right-0 z-30 flex flex-col rounded-none rounded-l-[32px] p-3"
      style={{ width }}
    >
      <div className={cn("surface-card mb-3 rounded-[26px] px-3 py-3", collapsed ? "" : "pb-4")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Tuari</p>
              <p className="mt-1 text-sm font-medium text-sidebar-foreground">{t("shell.workspace")}</p>
            </div>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label={collapsed ? expandLabel : collapseLabel}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl", collapsed ? "w-10 px-0" : "px-3")}
                  type="button"
                  onClick={() => onSetCollapsed(!collapsed)}
                >
                  {collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
                  {!collapsed ? <span>{collapseLabel}</span> : null}
                </button>
              }
            />
            <TooltipContent side="left">{collapsed ? expandLabel : collapseLabel}</TooltipContent>
          </Tooltip>
        </div>

        {!collapsed ? <div className="mt-4 h-px bg-gradient-to-l from-transparent via-border/80 to-transparent" /> : null}
      </div>

      <div className="surface-panel mb-4 rounded-[26px] p-3">
        <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "")}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(59,91,162,0.18)]">
            <UserSquare2 className="size-5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{session.name ?? dashboardLabel}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                <bdi dir="ltr">{session.phone}</bdi>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-2 px-1">
        {!collapsed ? <p className="px-3 text-[0.72rem] font-medium text-muted-foreground">{t("shell.mainNavigation")}</p> : null}
      </div>

      <nav className="flex-1 space-y-1.5" aria-label={t("shell.mainNavigation")}>
        {items.map(({ key, target, icon: Icon }) => {
          const active = activeKey === key
          const link = (
            <WorkspaceLink
              aria-current={active ? "page" : undefined}
              className={getNavClassName(active)}
              target={target}
            >
              <Icon className="size-4" />
              {!collapsed ? <span>{itemLabels[key]}</span> : null}
            </WorkspaceLink>
          )

          if (!collapsed) {
            return <div key={key}>{link}</div>
          }

          return (
            <Tooltip key={key}>
              <TooltipTrigger render={link} />
              <TooltipContent side="left">{itemLabels[key]}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <div className="mt-4 border-t border-border/70 pt-4">
        {!collapsed ? <p className="mb-2 px-4 text-[0.72rem] font-medium text-muted-foreground">{t("shell.preferencesSection")}</p> : null}
        <div className="space-y-1.5">
          <button
            className={getUtilityClassName()}
            type="button"
            onClick={onToggleTheme}
          >
            {theme === "light" ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
            {!collapsed ? <span>{themeToggleLabel}</span> : null}
          </button>
          <WorkspaceLink
            aria-current={currentPage === "settings" ? "page" : undefined}
            className={getUtilityClassName(currentPage === "settings")}
            target={workspaceRoutes.settings()}
          >
            <LayoutGrid className="size-4" />
            {!collapsed ? <span>{settingsLabel}</span> : null}
          </WorkspaceLink>
          <button
            className={cn(getUtilityClassName(), "hover:bg-destructive/8 hover:text-destructive")}
            type="button"
            onClick={onSignOut}
          >
            <LogOut className="size-4 text-destructive" />
            {!collapsed ? <span className="text-destructive">{signOutLabel}</span> : null}
          </button>
        </div>
      </div>
    </aside>
  )
}

export type { WorkspaceSidebarPage }
