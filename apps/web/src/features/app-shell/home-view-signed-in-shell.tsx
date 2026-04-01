import type { ReactNode } from "react"

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
  const sidebarWidth = sidebarCollapsed ? "5.5rem" : "18rem"

  return (
    <div className="min-h-screen overflow-hidden">
      <WorkspaceSidebar
        collapseLabel={copy.shell.collapse}
        collapsed={sidebarCollapsed}
        currentPage={page}
        dashboardLabel={copy.sections.dashboard.label}
        debtsLabel={copy.sections.debts.label}
        employeesLabel={copy.sections.employees.label}
        expandLabel={copy.shell.expand}
        externalPersonsLabel={copy.sections.externalPersons.label}
        projectsLabel={copy.sections.projects.label}
        rolesLabel={copy.sections.roles.label}
        salariesLabel={copy.sections.salaries.label}
        session={session}
        settingsLabel={copy.sections.settings.label}
        signOutLabel={copy.shell.signOut}
        theme={theme}
        themeToggleLabel={copy.shell.themeToggle}
        transactionsLabel={copy.sections.transactions.label}
        warehousesLabel={copy.sections.warehouses.label}
        width={sidebarWidth}
        onSetCollapsed={onSetSidebarCollapsed}
        onSignOut={() => onSignOutOpenChange(true)}
        onToggleTheme={onThemeToggle}
      />

      <main className="h-screen overflow-y-auto overscroll-contain" style={{ paddingRight: sidebarWidth }}>
        <div className="flex min-h-full min-w-0 flex-col gap-6 pb-8 pe-6 ps-6 pt-5">
          {page !== "dashboard" ? <WorkspaceBreadcrumbs items={breadcrumbItems} /> : null}
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
