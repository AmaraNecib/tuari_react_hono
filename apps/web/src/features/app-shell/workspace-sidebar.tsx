import {
  BriefcaseBusiness,
  Gauge,
  LayoutGrid,
  LogOut,
  Logs,
  MoonStar,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  SunMedium,
  UserSquare2,
  Users,
  Warehouse,
} from "lucide-react"
import { Link } from "@tanstack/react-router"

import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type WorkspaceSidebarPage =
  | "dashboard"
  | "employees"
  | "employees-create"
  | "employee-details"
  | "employee-edit"
  | "projects"
  | "project-details"
  | "project-edit"
  | "transactions"
  | "warehouses"
  | "warehouse-details"
  | "warehouse-edit"
  | "roles"
  | "settings"

type WorkspaceSidebarProps = {
  collapsed: boolean
  collapseLabel: string
  currentPage: WorkspaceSidebarPage
  dashboardLabel: string
  employeesLabel: string
  expandLabel: string
  projectsLabel: string
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
  { key: "dashboard", href: "/", icon: Gauge },
  { key: "employees", href: "/employees", icon: Users },
  { key: "projects", href: "/projects", icon: BriefcaseBusiness },
  { key: "warehouses", href: "/warehouses", icon: Warehouse },
  { key: "transactions", href: "/transactions", icon: Logs },
  { key: "roles", href: "/roles", icon: ShieldCheck },
] as const

export function WorkspaceSidebar({
  collapsed,
  collapseLabel,
  currentPage,
  dashboardLabel,
  employeesLabel,
  expandLabel,
  projectsLabel,
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
  const itemLabels = {
    dashboard: dashboardLabel,
    employees: employeesLabel,
    projects: projectsLabel,
    warehouses: warehousesLabel,
    transactions: transactionsLabel,
    roles: rolesLabel,
  } as const

  const activeKey =
    currentPage === "employees-create" || currentPage === "employee-details" || currentPage === "employee-edit"
      ? "employees"
      : currentPage === "project-details" || currentPage === "project-edit"
        ? "projects"
        : currentPage === "warehouse-details" || currentPage === "warehouse-edit"
          ? "warehouses"
          : currentPage

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex flex-col rounded-none rounded-l-[30px] border-s border-border/70 bg-sidebar/96 p-3 backdrop-blur-xl"
      style={{ width }}
    >
      <div className={cn("mb-3 flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
        {!collapsed ? <p className="text-xs font-medium text-muted-foreground">القائمة الرئيسية</p> : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label={collapsed ? expandLabel : collapseLabel}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), collapsed ? "w-9 px-0" : "px-3")}
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

      <div className="mb-4 rounded-[24px] border border-border/70 bg-background/50 p-3">
        <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "") }>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <UserSquare2 className="size-5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{session.name ?? dashboardLabel}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">{session.phone}</p>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-1.5">
        {items.map(({ key, href, icon: Icon }) => {
          const active = activeKey === key
          const link = (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: active ? "secondary" : "ghost", size: "default" }),
                "h-11 w-full rounded-2xl",
                collapsed ? "justify-center px-0" : "justify-start px-3",
              )}
              to={href as never}
            >
              <Icon className="size-4" />
              {!collapsed ? <span>{itemLabels[key]}</span> : null}
            </Link>
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

      <div className="mt-4 space-y-1.5 border-t border-border/70 pt-4">
        <button
          className={cn(
            buttonVariants({ variant: "ghost", size: "default" }),
            "h-11 w-full rounded-2xl",
            collapsed ? "justify-center px-0" : "justify-start px-3",
          )}
          type="button"
          onClick={onToggleTheme}
        >
          {theme === "light" ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
          {!collapsed ? <span>{themeToggleLabel}</span> : null}
        </button>
        <Link
          aria-current={currentPage === "settings" ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: currentPage === "settings" ? "secondary" : "ghost", size: "default" }),
            "h-11 w-full rounded-2xl",
            collapsed ? "justify-center px-0" : "justify-start px-3",
          )}
          to={"/settings" as never}
        >
          <LayoutGrid className="size-4" />
          {!collapsed ? <span>{settingsLabel}</span> : null}
        </Link>
        <button
          className={cn(buttonVariants({ variant: "ghost", size: "default" }), "h-11 w-full rounded-2xl", collapsed ? "justify-center px-0" : "justify-start px-3")}
          type="button"
          onClick={onSignOut}
        >
          <LogOut className="size-4 text-destructive" />
          {!collapsed ? <span className="text-destructive">{signOutLabel}</span> : null}
        </button>
      </div>
    </aside>
  )
}

export type { WorkspaceSidebarPage }
