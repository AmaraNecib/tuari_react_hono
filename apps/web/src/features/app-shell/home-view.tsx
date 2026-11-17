import "@/i18n"

import { useCallback, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { useAppPreferences } from "@/features/preferences/preferences"

import { useNotifyAppReady } from "@/hooks/use-notify-app-ready"

import { useHomeViewAuthController } from "./home-view-auth-controller"
import { HomeViewAuthScreen } from "./home-view-auth-screen"
import { buildHomeViewCopy } from "./home-view-copy"
import { buildHomeViewDerived } from "./home-view-derived"
import { useHomeViewNavigation } from "./home-view-navigation"
import { HomeViewPageContent } from "./home-view-page-content"
import { buildHomeViewSelection } from "./home-view-selection"
import { useHomeViewShellController } from "./home-view-shell-controller"
import { HomeViewSignedInShell } from "./home-view-signed-in-shell"
import {
  useAuthSetupStatusQuery,
  useBootstrapFirstUserMutation,
  useDemoSessionQuery,
  useDemoSignInMutation,
  useDemoSignOutMutation,
  useRemoveWorkspaceRecordMutation,
  useResetWorkspaceMutation,
  useUpdateAccountSettingsMutation,
} from "./workspace-mutations"
import { isRolesEndpointUnavailable, useCompositeWorkspaceQuery, useSystemLogQuery } from "./workspace-queries"
import type { HomeViewPage } from "./home-view-types"
import { TableQueryState } from "@/features/shared/table-primitives"
import { ErrorBoundary } from "@/components/error-boundary"
import { applicationClient } from "@/lib/application-client"
import { WorkspaceShell } from "./workspace-shell"

export type { HomeViewPage } from "./home-view-types"

function WorkspaceStateMessage({
  actionLabel,
  message,
  onAction,
}: {
  actionLabel?: string
  message: string
  onAction?: () => void
}) {
  return (
    <div className="min-h-screen p-6">
      <section className="rounded-xl border border-border/35 bg-surface p-6 xl:p-7">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
          {actionLabel && onAction ? (
            <button
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              type="button"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

/** Root workspace component: auth gate + shell. */
/**
 * @description Component
 */
export function HomeView({
  detailTab,
  page = "dashboard",
  counterpartyId,
  employeeId,
  invoiceId,
  projectId,
  warehouseId,
  paginationCursor,
  paginationLimit,
  paginationPrevCursors,
}: {
  detailTab?: string
  page?: HomeViewPage
  counterpartyId?: string
  employeeId?: string
  invoiceId?: string
  projectId?: string
  warehouseId?: string
  paginationCursor?: string
  paginationLimit?: number
  paginationPrevCursors?: string
}) {
  const { t } = useTranslation()
  const [pendingExactScope, setPendingExactScope] = useState<string | null>(null)
  const pendingExactScopeRef = useRef<string | null>(null)
  const navigation = useHomeViewNavigation()
  const { theme, toggleTheme } = useAppPreferences()

  const setupStatusQuery = useAuthSetupStatusQuery()
  const sessionQuery = useDemoSessionQuery()
  const bootstrapMutation = useBootstrapFirstUserMutation()
  const signInMutation = useDemoSignInMutation()
  const signOutMutation = useDemoSignOutMutation()
  const removeRecordMutation = useRemoveWorkspaceRecordMutation()
  const resetWorkspaceMutation = useResetWorkspaceMutation()
  const updateAccountSettingsMutation = useUpdateAccountSettingsMutation()

  const copy = useMemo(() => buildHomeViewCopy(t), [t])
  const detailCopy = copy.detailPages
  const auth = useHomeViewAuthController({
    bootstrapMutation,
    copy,
    sessionQuery,
    setupStatusQuery,
    signInMutation,
  })
  // Close the Tauri splashscreen as soon as the first data load settles
  // (success or error) — the earliest point the shell has real UI to show.
  useNotifyAppReady(!auth.isAuthStateLoading)
  const shell = useHomeViewShellController({
    copy,
    removeRecordMutation,
    resetWorkspaceMutation,
    signOutMutation,
    theme,
    toggleTheme,
  })
  const capabilitiesQuery = useQuery({
    queryKey: ["application", "capabilities", auth.session?.id ?? null],
    queryFn: () => applicationClient.applicationCapabilities(),
    enabled: Boolean(auth.session),
    retry: false,
    staleTime: 60_000,
  })
  const exactScopeKey = capabilitiesQuery.data && auth.session ? `${capabilitiesQuery.data.workspaceId}:${auth.session.id}` : null
  const handleExactPendingChange = useCallback((pending: boolean) => {
    if (!exactScopeKey) return
    if (pending) { pendingExactScopeRef.current = exactScopeKey; setPendingExactScope(exactScopeKey) }
    else if (pendingExactScopeRef.current === exactScopeKey) { pendingExactScopeRef.current = null; setPendingExactScope(null) }
  }, [exactScopeKey])
  const legacyRuntime = capabilitiesQuery.isError && isRolesEndpointUnavailable(capabilitiesQuery.error)
  const legacyWorkspaceEnabled = Boolean(auth.session) && legacyRuntime
  const workspaceQuery = useCompositeWorkspaceQuery({ enabled: legacyWorkspaceEnabled })
  const systemLogQuery = useSystemLogQuery({ enabled: page === "transactions" && legacyWorkspaceEnabled, filters: shell.systemLogFilters })
  const workspace = workspaceQuery.data
  const derived = useMemo(
    () => (workspace ? buildHomeViewDerived({ copy, detailCopy, t, workspace }) : null),
    [copy, detailCopy, t, workspace],
  )
  const { breadcrumbItems, selectedCounterparty, selectedEmployee, selectedProject, selectedWarehouse } = buildHomeViewSelection({
    counterpartyId,
    copy,
    derived,
    employeeId,
    invoiceId,
    page,
    projectId,
    t,
    warehouseId,
  })

  if (!auth.session) {
    return (
      <HomeViewAuthScreen
        authError={auth.authError}
        authStartupError={auth.authStartupError}
        bootstrapPending={bootstrapMutation.isPending}
        copy={copy}
        errors={auth.errors}
        isAuthStateLoading={auth.isAuthStateLoading}
        isFirstRun={auth.isFirstRun}
        name={auth.name}
        password={auth.password}
        passwordHideLabel={copy.common.hidePassword}
        passwordShowLabel={copy.common.showPassword}
        phone={auth.phone}
        requiresSetupKey={auth.requiresSetupKey}
        setupSecret={auth.setupSecret}
        signInPending={signInMutation.isPending}
        onBootstrapSubmit={auth.handleBootstrap}
        onNameChange={auth.setName}
        onPasswordChange={auth.setPassword}
        onPhoneChange={auth.setPhone}
        onRetryAuthState={() => void auth.retryAuthState()}
        onSetupSecretChange={auth.setSetupSecret}
        onSignInSubmit={auth.handleSignIn}
      />
    )
  }

  if (capabilitiesQuery.data && auth.session) {
    const exactSession = auth.session
    const contentBoundaryKey = [page, detailTab, employeeId, projectId, warehouseId].filter(Boolean).join(":")
    return (
      <HomeViewSignedInShell
        breadcrumbItems={breadcrumbItems}
        copy={copy}
        deletePending={false}
        page={page}
        pendingDelete={null}
        session={auth.session}
        sidebarCollapsed={shell.sidebarCollapsed}
        showRestartModal={shell.showRestartModal}
        signOutPending={signOutMutation.isPending}
        signOutOpen={shell.signOutOpen}
        theme={theme}
        onConfirmDelete={() => undefined}
        onConfirmSignOut={() => { if (pendingExactScopeRef.current === null) void shell.confirmSignOut() }}
        signOutBlocked={pendingExactScope !== null}
        onPendingDeleteChange={() => undefined}
        onRestartLater={shell.handleRestartLater}
        onRestartNow={() => { if (pendingExactScopeRef.current === null) shell.handleRestartNow() }}
        onSetSidebarCollapsed={shell.setSidebarCollapsed}
        onSignOutOpenChange={shell.setSignOutOpen}
        onThemeToggle={shell.handleThemeToggle}
        exactMode
        exactSearch={{ workspaceId: capabilitiesQuery.data.workspaceId, userId: exactSession.id, client: applicationClient }}
      >
        <ErrorBoundary key={contentBoundaryKey}>
          <WorkspaceShell key={`${capabilitiesQuery.data.workspaceId}:${exactSession.id}`} client={applicationClient} capabilities={capabilitiesQuery.data} copy={copy} employeeId={employeeId} projectId={projectId} warehouseId={warehouseId} detailTab={detailTab} paginationCursor={paginationCursor} paginationLimit={paginationLimit} paginationPrevCursors={paginationPrevCursors} onEmployeePaginationChange={navigation.setEmployeePagination} onEmployeeTab={(id, tab) => void navigation.setEmployeeTab(id, tab)} onProjectTab={(id, tab) => void navigation.setProjectTab(id, tab)} onWarehouseTab={(id, tab) => void navigation.setWarehouseTab(id, tab)} page={page} session={exactSession} theme={theme} resetWorkspacePending={resetWorkspaceMutation.isPending} updateAccountPending={updateAccountSettingsMutation.isPending} onResetWorkspace={() => shell.handleResetWorkspace()} onSaveAccount={payload => updateAccountSettingsMutation.mutateAsync(payload)} onThemeToggle={toggleTheme} onUpdateApplied={() => shell.setShowRestartModal(true)} onPendingCommandChange={handleExactPendingChange} />
        </ErrorBoundary>
      </HomeViewSignedInShell>
    )
  }

  if (capabilitiesQuery.isError && !legacyRuntime) {
    return <WorkspaceStateMessage actionLabel={t("common.retry")} message={t("shell.loadWorkspaceError")} onAction={() => void capabilitiesQuery.refetch()} />
  }

  if (!derived) {
    if (capabilitiesQuery.isPending || workspaceQuery.isPending) {
      return <WorkspaceStateMessage message={t("shell.loadingWorkspace")} />
    }

    return (
      <WorkspaceStateMessage
        actionLabel={t("common.retry")}
        message={t("shell.loadWorkspaceError")}
        onAction={() => void workspaceQuery.refetch()}
      />
    )
  }

  // workspace is guaranteed to exist when derived is non-null.
  const ws = workspace!

  const contentBoundaryKey = [page, detailTab, counterpartyId, employeeId, invoiceId, projectId, warehouseId]
    .filter(Boolean)
    .join(":")

  return (
    <HomeViewSignedInShell
      breadcrumbItems={breadcrumbItems}
      copy={copy}
      deletePending={removeRecordMutation.isPending}
      page={page}
      pendingDelete={shell.pendingDelete}
      session={auth.session}
      sidebarCollapsed={shell.sidebarCollapsed}
      showRestartModal={shell.showRestartModal}
      signOutPending={signOutMutation.isPending}
      signOutOpen={shell.signOutOpen}
      theme={theme}
      onConfirmDelete={() => void shell.confirmDelete()}
      onConfirmSignOut={() => void shell.confirmSignOut()}
      onPendingDeleteChange={shell.setPendingDelete}
      onRestartLater={shell.handleRestartLater}
      onRestartNow={shell.handleRestartNow}
      onSetSidebarCollapsed={shell.setSidebarCollapsed}
      onSignOutOpenChange={shell.setSignOutOpen}
      onThemeToggle={shell.handleThemeToggle}
    >
      <ErrorBoundary key={contentBoundaryKey}>
        <TableQueryState query={workspaceQuery} resource={t("shell.workspace")}>
          <HomeViewPageContent
            copy={copy}
            derived={derived}
            detailTab={detailTab}
            invoiceId={invoiceId}
            page={page}
            paginationCursor={paginationCursor}
            paginationLimit={paginationLimit}
            paginationPrevCursors={paginationPrevCursors}
            selectedCounterparty={selectedCounterparty}
            selectedEmployee={selectedEmployee}
            selectedProject={selectedProject}
            selectedWarehouse={selectedWarehouse}
            session={auth.session}
            systemLogFilters={shell.systemLogFilters}
            systemLogState={{
              ...systemLogQuery,
              entries: systemLogQuery.data?.items ?? [],
            }}
            t={t}
            theme={theme}
            resetWorkspacePending={resetWorkspaceMutation.isPending}
            updateAccountPending={updateAccountSettingsMutation.isPending}
            workspace={ws}
            navigation={navigation}
            onAddProject={() => void navigation.goToProjectCreate()}
            onAddWarehouse={() => void navigation.goToWarehouseCreate()}
            onResetWorkspace={() => shell.handleResetWorkspace()}
            onSaveAccount={(payload) => updateAccountSettingsMutation.mutateAsync(payload)}
            onUpdateApplied={() => shell.setShowRestartModal(true)}
            onSetPendingDelete={shell.setPendingDelete}
            onSystemLogFiltersChange={shell.setSystemLogFilters}
            onThemeToggle={toggleTheme}
          />
        </TableQueryState>
      </ErrorBoundary>
    </HomeViewSignedInShell>
  )
}
