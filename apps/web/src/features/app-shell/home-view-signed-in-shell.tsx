import type { ReactNode } from "react"
import { LogOut, MoonStar, Settings, SunMedium } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
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
  const sidebarWidth = sidebarCollapsed ? "5.5rem" : "18rem"
  const pageLabel =
    page === "inventory"
      ? t("workspace.shell.itemsGuide")
      : page === "invoices" || page === "invoice-create" || page === "invoice-details"
        ? t("workspace.shell.invoices")
        : copy.sections.dashboard.label

  return (
    <div className="min-h-screen overflow-hidden">
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
        width={sidebarWidth}
        onSetCollapsed={onSetSidebarCollapsed}
      />

      <main className="h-screen overflow-y-auto" style={{ paddingRight: `calc(${sidebarWidth} + 1.5rem)` }}>
        <div className="flex min-h-full min-w-0 flex-col gap-6 pb-8 pe-6 ps-6 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 text-right">
              {page !== "dashboard" ? (
                <WorkspaceBreadcrumbs items={breadcrumbItems} />
              ) : (
                <div className="text-sm font-medium text-muted-foreground">{pageLabel}</div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/82 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl">
              <Button aria-label={copy.shell.signOut} className="size-9 rounded-xl text-destructive hover:text-destructive" size="icon" type="button" variant="ghost" onClick={() => onSignOutOpenChange(true)}>
                <LogOut className="size-4" />
              </Button>
              <WorkspaceLink aria-label={copy.sections.settings.label} className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" target={workspaceRoutes.settings()}>
                <Settings className="size-4" />
              </WorkspaceLink>
              <Button aria-label={copy.shell.themeToggle} className="size-9 rounded-xl" size="icon" type="button" variant="ghost" onClick={onThemeToggle}>
                {theme === "light" ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
              </Button>
            </div>
          </div>

          {children}
        </div>
      </main>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => (!open && !deletePending ? onPendingDeleteChange(null) : null)}>
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

      <AlertDialog open={signOutOpen} onOpenChange={(open) => (!signOutPending ? onSignOutOpenChange(open) : null)}>
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
