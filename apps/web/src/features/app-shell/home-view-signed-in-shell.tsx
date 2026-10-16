import type { ReactNode } from "react"
import { useState, useMemo, useEffect } from "react"
import Fuse from "fuse.js"
import { LogOut, MoonStar, PanelRightClose, PanelRightOpen, Settings, SunMedium, Menu, Search, HelpCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMobileLayout } from "@/hooks/use-mobile-layout"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useEmployeesQuery, useProjectsQuery, useWarehousesQuery, useDebtAccountsQuery, useExternalCounterpartiesQuery } from "./workspace-queries"
import { useInventoryItemDefinitionsQuery, useInventoryInvoiceGroupsQuery } from "@/features/inventory/inventory-hooks"
import { UserJourneyTour } from "@/hooks/use-user-journey"
import { SearchDialog, type SearchItem } from "@/components/ui/search-dialog"
import { KeyboardShortcutsHelp } from "@/components/ui/keyboard-shortcuts-provider"
import { SkipNavigation, MainContent } from "@/components/ui/skip-navigation"

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
import type { DemoSession } from "./workspace-mutations"
import type { HomeViewPage, PendingDelete } from "./home-view-types"
import { WorkspaceBreadcrumbs } from "./workspace-breadcrumbs"
import { UpdateRestartModal, UpdateRestartBadge } from "@/features/update"
import { WorkspaceSidebar } from "./workspace-sidebar"
import { WorkspaceLink, workspaceRoutes } from "@/router/navigation"
import { formatDebtAmount, getDebtAccountBalanceDisplay } from "@/features/debts/debt-utils"

/** Main app shell with sidebar, header, and content area. */
/**
 * @description Component
 */
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
  showRestartModal,
  onConfirmDelete,
  onConfirmSignOut,
  onPendingDeleteChange,
  onRestartLater,
  onRestartNow,
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
  showRestartModal: boolean
  onConfirmDelete: () => void
  onConfirmSignOut: () => void
  onPendingDeleteChange: (value: PendingDelete | null) => void
  onRestartLater: () => void
  onRestartNow: () => void
  onSetSidebarCollapsed: (value: boolean) => void
  onSignOutOpenChange: (value: boolean) => void
  onThemeToggle: () => void
}) {
  const { t } = useTranslation()
  const { isMobile, sidebarOpen, toggleSidebar, closeSidebar } = useMobileLayout()

  // Close the mobile drawer after any navigation — sidebar links, breadcrumbs,
  // header links — so the drawer never lingers over the newly loaded page
  // (issue #284). closeSidebar is a stable useCallback, so this only fires
  // when the route's page changes.
  useEffect(() => {
    closeSidebar()
  }, [closeSidebar, page])

  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Debounce the query so the fuzzy search (fuse.search) only runs after
  // the user pauses typing (~175ms). The searchOpen reset key drops any stale
  // debounced value synchronously when the dialog (re)opens — a rapid
  // close/reopen can never surface the previous query's results (issue #280).
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 175, searchOpen)

  const openSearch = () => {
    setSearchQuery("")
    setSearchOpen(true)
  }
  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery("")
  }

  // Global keyboard shortcuts — registered here where the handlers live
  useKeyboardShortcuts({
    onSearch: openSearch,
    onHelp: () => setHelpOpen(true),
    onToggleSidebar: () => isMobile ? toggleSidebar() : onSetSidebarCollapsed(!sidebarCollapsed),
  })

  // Fetch data for global search (only when search is open)
  const employeesQuery = useEmployeesQuery({ enabled: searchOpen })
  const projectsQuery = useProjectsQuery({ enabled: searchOpen })
  const warehousesQuery = useWarehousesQuery({ enabled: searchOpen })
  const debtAccountsQuery = useDebtAccountsQuery({ enabled: searchOpen })
  const externalsQuery = useExternalCounterpartiesQuery({ enabled: searchOpen })
  const inventoryQuery = useInventoryItemDefinitionsQuery({ enabled: searchOpen })
  const invoicesQuery = useInventoryInvoiceGroupsQuery({ enabled: searchOpen })

  // Build the unified search corpus + Fuse index lazily — they only exist
  // while the dialog is open and rebuild only when the query DATA changes,
  // never on keystrokes (the live query is kept out of these deps; issue #280).
  const { allSearchItems, fuse } = useMemo(() => {
    if (!searchOpen) {
      return { allSearchItems: [] as SearchItem[], fuse: null as Fuse<SearchItem> | null }
    }

    // ── Each page is a category with sub-actions ──
    const pages: SearchItem[] = [
      {
        id: "wh", title: t("sections.warehouses.label"), category: t("search.categories.pages"),
        children: [
          { id: "wh-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/warehouses" } },
          { id: "wh-create", title: t("search.actions.createWarehouse"), action: () => { window.location.href = "/warehouses/create" } },
          { id: "wh-inv", title: t("search.actions.goToInventory"), action: () => { window.location.href = "/inventory" } },
        ],
      },
      {
        id: "emp", title: t("sections.employees.label"), category: t("search.categories.pages"),
        children: [
          { id: "emp-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/employees" } },
          { id: "emp-create", title: t("search.actions.createEmployee"), action: () => { window.location.href = "/employees/create" } },
          { id: "emp-salaries", title: t("search.actions.goToSalaries"), action: () => { window.location.href = "/salaries" } },
        ],
      },
      {
        id: "proj", title: t("sections.projects.label"), category: t("search.categories.pages"),
        children: [
          { id: "proj-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/projects" } },
          { id: "proj-create", title: t("search.actions.createProject"), action: () => { window.location.href = "/projects/create" } },
        ],
      },
      {
        id: "debt", title: t("debts.label"), category: t("search.categories.pages"),
        children: [
          { id: "debt-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/debts" } },
          { id: "debt-create", title: t("search.actions.createDebt"), action: () => { window.location.href = "/debts/create" } },
        ],
      },
      {
        id: "ext", title: t("sections.externals.label"), category: t("search.categories.pages"),
        children: [
          { id: "ext-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/externals" } },
          { id: "ext-create", title: t("search.actions.createExternal"), action: () => { window.location.href = "/externals/create" } },
        ],
      },
      {
        id: "inv", title: t("shell.itemsGuide"), category: t("search.categories.pages"),
        children: [
          { id: "inv-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/inventory" } },
          { id: "inv-create", title: t("search.actions.createItem"), action: () => { window.location.href = "/inventory" } },
        ],
      },
      {
        id: "invgrp", title: t("shell.invoices"), category: t("search.categories.pages"),
        children: [
          { id: "invgrp-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/invoices" } },
          { id: "invgrp-create", title: t("search.actions.createInvoice"), action: () => { window.location.href = "/invoices/create" } },
        ],
      },
      {
        id: "sal", title: t("sections.salaries.label"), category: t("search.categories.pages"),
        children: [
          { id: "sal-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/salaries" } },
        ],
      },
      {
        id: "txn", title: t("sections.transactions.label"), category: t("search.categories.pages"),
        children: [
          { id: "txn-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/transactions" } },
        ],
      },
      {
        id: "role", title: t("sections.roles.label"), category: t("search.categories.pages"),
        children: [
          { id: "role-list", title: t("search.actions.viewAll"), action: () => { window.location.href = "/roles" } },
        ],
      },
      { id: "nav-dashboard", title: t("sections.dashboard.label"), category: t("search.categories.pages"), action: () => { window.location.href = "/" } },
      { id: "nav-settings", title: t("sections.settings.label"), category: t("search.categories.pages"), action: () => { window.location.href = "/settings" } },
    ]

    // ── Data items from database ──
    const employees: SearchItem[] = (employeesQuery.data?.items ?? []).map((emp) => ({
      id: `emp-${emp.id}`,
      title: `${emp.firstName} ${emp.lastName}`,
      description: emp.phone,
      category: t("sections.employees.label"),
      action: () => { window.location.href = `/employees/${emp.id}` },
    }))

    const projects: SearchItem[] = (projectsQuery.data?.items ?? []).map((p) => ({
      id: `proj-${p.id}`,
      title: p.name,
      description: p.location ?? undefined,
      category: t("sections.projects.label"),
      action: () => { window.location.href = `/projects/${p.id}` },
    }))

    const warehouses: SearchItem[] = (warehousesQuery.data?.items ?? []).map((w) => ({
      id: `wh-${w.id}`,
      title: w.name,
      description: w.address ?? undefined,
      category: t("sections.warehouses.label"),
      action: () => { window.location.href = `/warehouses/${w.id}` },
    }))

    const debts: SearchItem[] = (debtAccountsQuery.data?.items ?? []).map((d) => {
      const empList = employeesQuery.data?.items ?? []
      const extList = externalsQuery.data?.items ?? []
      const partyName = d.partyType === "INTERNAL_WORKER"
        ? empList.find((e) => e.id === d.workerId)
        : extList.find((e) => e.id === d.externalCounterpartyId)
      const name = partyName && "firstName" in partyName
        ? `${partyName.firstName} ${partyName.lastName}`
        : partyName && "fullName" in partyName
          ? partyName.fullName
          : t("search.unknownParty")
      const balance = getDebtAccountBalanceDisplay(d)
      return {
        id: `debt-${d.id}`,
        title: name,
        description: `${balance.phrase} ${formatDebtAmount(balance.amount)} ${t("search.currency")}`,
        category: t("debts.label"),
        action: () => { window.location.href = "/debts" },
      }
    })

    const externals: SearchItem[] = (externalsQuery.data?.items ?? []).map((e) => ({
      id: `ext-${e.id}`,
      title: e.fullName,
      description: e.phoneNumber,
      category: t("sections.externals.label"),
      action: () => { window.location.href = `/externals/${e.id}` },
    }))

    const inventory: SearchItem[] = (inventoryQuery.data?.items ?? []).map((item) => ({
      id: `inv-${item.id}`,
      title: item.name,
      description: item.description ?? item.unit ?? undefined,
      category: t("shell.itemsGuide"),
      action: () => { window.location.href = "/inventory" },
    }))

    const invoices: SearchItem[] = (invoicesQuery.data?.items ?? []).map((inv) => ({
      id: `invgrp-${inv.id}`,
      title: inv.invoiceNumber ?? t("search.unknownParty"),
      description: inv.supplierName ?? undefined,
      category: t("shell.invoices"),
      action: () => { window.location.href = `/invoices/${inv.id}` },
    }))

    const allSearchItems: SearchItem[] = [...pages, ...employees, ...projects, ...warehouses, ...debts, ...externals, ...inventory, ...invoices]

    // Fuse.js instance — fuzzy search with typo tolerance
    // Also index children so typing "مستودع" or "إنشاء" finds sub-actions
    // Flatten: parent items + their children as searchable items
    const flat: SearchItem[] = []
    for (const item of allSearchItems) {
      flat.push(item)
      if (item.children) {
        for (const child of item.children) {
          flat.push({ ...child, category: item.title })
        }
      }
    }
    const fuse = new Fuse(flat, {
      keys: ["title", "description", "category"],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1,
      ignoreLocation: true,
    })

    return { allSearchItems, fuse }
  }, [searchOpen, t, employeesQuery.data, projectsQuery.data, warehousesQuery.data, debtAccountsQuery.data, externalsQuery.data, inventoryQuery.data, invoicesQuery.data])

  // Filter search results using fuzzy matching — only the debounced query
  // reaches the expensive fuse.search. Clearing the input restores the
  // categories immediately (checked against the live query), while a fresh
  // keystroke shows categories until the debounce settles.
  const searchResults = useMemo(() => {
    if (!searchOpen || !fuse) {
      return []
    }
    if (!searchQuery.trim() || !debouncedSearchQuery.trim()) {
      return allSearchItems.filter((item) => item.children && item.children.length > 0)
    }
    return fuse.search(debouncedSearchQuery).slice(0, 20).map((r) => r.item)
  }, [searchOpen, searchQuery, debouncedSearchQuery, fuse, allSearchItems])

  const tourSteps = [
    {
      id: "sidebar",
      target: '[data-tour="sidebar"]',
      title: t("tour.sidebarTitle"),
      content: t("tour.sidebarContent"),
      position: "right" as const,
    },
    {
      id: "search",
      target: '[data-tour="search"]',
      title: t("tour.searchTitle"),
      content: t("tour.searchContent"),
      position: "bottom" as const,
    },
    {
      id: "help",
      target: '[data-tour="help"]',
      title: t("tour.helpTitle"),
      content: t("tour.helpContent"),
      position: "bottom" as const,
    },
  ]

  return (
    <UserJourneyTour steps={tourSteps} storageKey="home-tour" autoStart>
    {/* Skip link must precede the shell grid so it stays the first focusable
        element and never becomes a grid item (issue #284). */}
    <SkipNavigation />
    <div
      className="tauri-shell"
      data-collapsed={sidebarCollapsed ? "true" : "false"}
      data-sidebar-open={sidebarOpen ? "true" : "false"}
    >
      {/* Sidebar — first in DOM = right side in RTL CSS grid */}
      <WorkspaceSidebar
        dataTour="sidebar"
        collapseLabel={copy.shell.collapse}
        collapsed={sidebarCollapsed}
        currentPage={page}
        dashboardLabel={copy.sections.dashboard.label}
        debtsLabel={copy.sections.debts.label}
        employeesLabel={copy.sections.employees.label}
        expensesLabel={t("expenses.title")}
        externalsLabel={copy.sections.externals.label}
        expandLabel={copy.shell.expand}
        inventoryLabel={t("shell.itemsGuide")}
        invoicesLabel={t("shell.invoices")}
        projectsLabel={copy.sections.projects.label}
        rolesLabel={copy.sections.roles.label}
        salariesLabel={copy.sections.salaries.label}
        session={session}
        transactionsLabel={copy.sections.transactions.label}
        transferHistoryLabel={t("shell.transferHistory")}
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
            aria-label={isMobile ? (sidebarOpen ? copy.shell.collapse : copy.shell.expand) : (sidebarCollapsed ? copy.shell.expand : copy.shell.collapse)}
            className="w-[44px] h-[44px] grid place-items-center rounded-[0.4375rem] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors flex-shrink-0 -ms-2"
            onClick={() => isMobile ? toggleSidebar() : onSetSidebarCollapsed(!sidebarCollapsed)}
          >
            {isMobile ? (
              <Menu size={20} />
            ) : (
              sidebarCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />
            )}
          </button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-[13px] min-w-0 flex-1">
            {page !== "dashboard" ? (
              <WorkspaceBreadcrumbs items={breadcrumbItems} />
            ) : (
              <span className="font-medium text-ink">{copy.sections.dashboard.label}</span>
            )}
          </div>

          {/* Restart badge — shown when update is pending */}
          <UpdateRestartBadge />

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Search button — Ctrl+K */}
            <button
              type="button"
              data-tour="search"
              aria-label={t("shortcuts.search")}
              className="w-[44px] h-[44px] grid place-items-center rounded-[0.4375rem] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              onClick={openSearch}
              title={t("shortcuts.search")}
            >
              <Search size={18} />
            </button>
            {/* Help button — ? key */}
            <button
              type="button"
              data-tour="help"
              aria-label={t("shortcuts.openHelp")}
              className="w-[44px] h-[44px] grid place-items-center rounded-[0.4375rem] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              onClick={() => setHelpOpen(true)}
              title={t("shortcuts.openHelp")}
            >
              <HelpCircle size={18} />
            </button>

            <button
              type="button"
              aria-label={copy.shell.themeToggle}
              className="w-[44px] h-[44px] grid place-items-center rounded-[0.4375rem] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              onClick={onThemeToggle}
            >
              {theme === "light" ? <MoonStar size={18} /> : <SunMedium size={18} />}
            </button>

            <WorkspaceLink
              aria-label={copy.sections.settings.label}
              className="w-[44px] h-[44px] grid place-items-center rounded-[0.4375rem] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              target={workspaceRoutes.settings()}
            >
              <Settings size={18} />
            </WorkspaceLink>

            <button
              type="button"
              aria-label={copy.shell.signOut}
              className="w-[44px] h-[44px] grid place-items-center rounded-[0.4375rem] text-bad hover:bg-bad-soft transition-colors"
              onClick={() => onSignOutOpenChange(true)}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Scrollable page content */}
        <MainContent className="flex-1 overflow-auto overscroll-contain px-10 py-8">
          {children}
        </MainContent>
      </div>

      {/* Mobile drawer backdrop — a real element so tapping it closes the
          drawer. Rendered AFTER the main area so the `.tauri-shell > aside + div`
          selectors still match the main area (aside must be followed by the
          content div). Replaces the old .tauri-shell::after pseudo-element,
          which could never receive clicks and trapped the user (issue #284). */}
      {isMobile && (
        <div
          className="sb-mobile-backdrop"
          data-open={sidebarOpen ? "true" : "false"}
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

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

      {/* Search dialog */}
      <SearchDialog
        isOpen={searchOpen}
        onClose={closeSearch}
        onQueryChange={setSearchQuery}
        results={searchResults}
      />

      {/* Keyboard shortcuts help */}
      <KeyboardShortcutsHelp
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      {/* Update restart modal */}
      <UpdateRestartModal
        open={showRestartModal}
        onRestartNow={onRestartNow}
        onLater={onRestartLater}
      />

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
    </UserJourneyTour>
  )
}
