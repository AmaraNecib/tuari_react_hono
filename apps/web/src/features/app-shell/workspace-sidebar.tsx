import {
  BriefcaseBusiness,
  Gauge,
  HandCoins,
  Boxes,
  Logs,
  PanelRightClose,
  PanelRightOpen,
  ReceiptText,
  UserSquare2,
  Users,
  Warehouse,
  FileText,
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
  salariesLabel: string
  rolesLabel: string
  transactionsLabel: string
  session: {
    name: string | null
    phone: string
  }
  warehousesLabel: string
  width: string
  onSetCollapsed: (nextValue: boolean) => void
}

const items = [
  { key: "dashboard", target: workspaceRoutes.dashboard(), icon: Gauge },
  { key: "employees", target: workspaceRoutes.employees(), icon: Users },
  { key: "externals", target: workspaceRoutes.externals(), icon: UserSquare2 },
  { key: "debts", target: workspaceRoutes.debts(), icon: HandCoins },
  { key: "projects", target: workspaceRoutes.projects(), icon: BriefcaseBusiness },
  { key: "salaries", target: workspaceRoutes.salaries(), icon: ReceiptText },
  { key: "warehouses", target: workspaceRoutes.warehouses(), icon: Warehouse },
  { key: "inventory", target: workspaceRoutes.inventory(), icon: Boxes },
  { key: "invoices", target: workspaceRoutes.invoices(), icon: FileText },
  { key: "transactions", target: workspaceRoutes.transactions(), icon: Logs },
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
  externalsLabel,
  expandLabel,
  inventoryLabel,
  invoicesLabel,
  projectsLabel,
  salariesLabel,
  transactionsLabel,
  warehousesLabel,
  width,
  onSetCollapsed,
}: WorkspaceSidebarProps) {
  const { t } = useTranslation()
  const itemLabels = {
    dashboard: dashboardLabel,
    debts: debtsLabel,
    employees: employeesLabel,
    externals: externalsLabel,
    inventory: inventoryLabel,
    invoices: invoicesLabel,
    projects: projectsLabel,
    salaries: salariesLabel,
    warehouses: warehousesLabel,
    transactions: transactionsLabel,
  } as const

  const activeKey =
    currentPage === "employees-create" || currentPage === "employee-details" || currentPage === "employee-edit"
      ? "employees"
      : currentPage === "debt-create"
        ? "debts"
        : currentPage === "externals" || currentPage === "external-create" || currentPage === "external-details"
          ? "externals"
        : currentPage === "project-details" || currentPage === "project-create" || currentPage === "project-edit"
          ? "projects"
        : currentPage === "warehouse-details" || currentPage === "warehouse-create" || currentPage === "warehouse-edit"
          ? "warehouses"
          : currentPage === "invoice-create" || currentPage === "invoice-details"
            ? "invoices"
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
      <div className={cn("mb-4 flex items-center", collapsed ? "justify-center" : "justify-start px-1 pt-1")}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label={collapsed ? expandLabel : collapseLabel}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "size-9 rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                type="button"
                onClick={() => onSetCollapsed(!collapsed)}
              >
                {collapsed ? <PanelRightOpen className="size-5" /> : <PanelRightClose className="size-5" />}
              </button>
            }
          />
          <TooltipContent side="left">{collapsed ? expandLabel : collapseLabel}</TooltipContent>
        </Tooltip>
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
    </aside>
  )
}

export type { WorkspaceSidebarPage }
