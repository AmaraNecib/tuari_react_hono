import type { ReactNode } from "react"
import { LogOut, MoonStar, PanelRightClose, PanelRightOpen, Settings, SunMedium } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import type { HomeViewCopy } from "./home-view-copy"
import type { HomeViewBreadcrumbItem } from "./home-view-breadcrumbs"
import type { DemoSession } from "./mock-dashboard"
import type { HomeViewPage, PendingDelete } from "./home-view-types"
import { WorkspaceBreadcrumbs } from "./workspace-breadcrumbs"
import { WorkspaceSidebar } from "./workspace-sidebar"
import { WorkspaceLink, workspaceRoutes } from "@/router/navigation"

export function HomeViewSignedInShell({
  breadcrumbItems,
  children,
  copy,
  deletePending,
  page,
  pendingDelete,
  session,
  sidebarCollapsed,
  signOutPending,
  signOutOpen,
  theme,
  onConfirmDelete,
  onConfirmSignOut,
  onPendingDeleteChange,
  onSetSidebarCollapsed,
  onSignOutOpenChange,
  onThemeToggle,
}: {
  breadcrumbItems: HomeViewBreadcrumbItem[]
  children: ReactNode
  copy: HomeViewCopy
  deletePending: boolean
  page: HomeViewPage
  pendingDelete: PendingDelete | null
  session: NonNullable<DemoSession>
  sidebarCollapsed: boolean
  signOutPending: boolean
  signOutOpen: boolean
  theme: "light" | "dark"
  onConfirmDelete: () => void
  onConfirmSignOut: () => void
  onPendingDeleteChange: (value: PendingDelete | null) => void
  onSetSidebarCollapsed: (value: boolean) => void
  onSignOutOpenChange: (value: boolean) => void
  onThemeToggle: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="tauri-shell"
      data-collapsed={sidebarCollapsed ? "true" : "false"}
    >
      {/* Sidebar — first in DOM = right side in RTL CSS grid */}
      <WorkspaceSidebar
        collapseLabel={copy.shell.collapse}
        collapsed={sidebarCollapsed}
        currentPage={page}
        dashboardLabel={copy.sections.dashboard.label}
        debtsLabel={copy.sections.debts.label}
        employeesLabel={copy.sections.employees.label}
        externalsLabel={copy.sections.externals.label}
        expandLabel={copy.shell.expand}
        inventoryLabel={t("workspace.shell.itemsGuide")}
        invoicesLabel={t("workspace.shell.invoices")}
        projectsLabel={copy.sections.projects.label}
        rolesLabel={copy.sections.roles.label}
        salariesLabel={copy.sections.salaries.label}
        session={session}
        transactionsLabel={copy.sections.transactions.label}
        warehousesLabel={copy.sections.warehouses.label}
        width=""
        onSetCollapsed={onSetSidebarCollapsed}
      />

      {/* Main area */}
      <div className="flex flex-col min-w-0 bg-bg overflow-hidden">
        {/* Topbar */}
        <header
          className="flex items-center gap-3 px-4 border-b border-line bg-bg flex-shrink-0"
          style={{ height: "var(--header-h)" }}
        >
          {/* Sidebar toggle */}
          <button
            type="button"
            aria-label={sidebarCollapsed ? copy.shell.expand : copy.shell.collapse}
            className="w-[30px] h-[30px] grid place-items-center rounded-[7px] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors flex-shrink-0"
            onClick={() => onSetSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-[13px] min-w-0 flex-1">
            {page !== "dashboard" ? (
              <WorkspaceBreadcrumbs items={breadcrumbItems} />
            ) : (
              <span className="font-medium text-ink">{copy.sections.dashboard.label}</span>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              aria-label={copy.shell.themeToggle}
              className="w-[30px] h-[30px] grid place-items-center rounded-[7px] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              onClick={onThemeToggle}
            >
              {theme === "light" ? <MoonStar size={16} /> : <SunMedium size={16} />}
            </button>

            <WorkspaceLink
              aria-label={copy.sections.settings.label}
              className="w-[30px] h-[30px] grid place-items-center rounded-[7px] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              target={workspaceRoutes.settings()}
            >
              <Settings size={16} />
            </WorkspaceLink>

            <button
              type="button"
              aria-label={copy.shell.signOut}
              className="w-[30px] h-[30px] grid place-items-center rounded-[7px] text-bad hover:bg-bad-soft transition-colors"
              onClick={() => onSignOutOpenChange(true)}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Scrollable page content */}
        <div className="flex-1 overflow-auto overscroll-contain px-10 py-8">
          {children}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => (!open && !deletePending ? onPendingDeleteChange(null) : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.shell.destructiveTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.shell.destructiveDescription}
              {pendingDelete ? ` ${pendingDelete.label}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={deletePending} onClick={onConfirmDelete}>{copy.common.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign-out confirmation dialog */}
      <AlertDialog
        open={signOutOpen}
        onOpenChange={(open) => (!signOutPending ? onSignOutOpenChange(open) : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.shell.signOutTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.shell.signOutDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signOutPending}>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={signOutPending} onClick={onConfirmSignOut}>{copy.common.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
