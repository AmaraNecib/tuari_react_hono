import "@/i18n"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useAppPreferences } from "@/features/preferences/preferences"

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
  useDemoWorkspaceQuery,
  useRemoveWorkspaceRecordMutation,
  useResetWorkspaceMutation,
  useSystemLogQuery,
  useUpdateAccountSettingsMutation,
} from "./mock-dashboard"
import type { HomeViewPage } from "./home-view-types"

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
      <section className="rounded-[32px] border border-border/35 bg-background/18 p-6 backdrop-blur-xl xl:p-7">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
          {actionLabel && onAction ? (
            <button
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
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

export function HomeView({
  detailTab,
  page = "dashboard",
  counterpartyId,
  employeeId,
  invoiceId,
  projectId,
  warehouseId,
}: {
  detailTab?: string
  page?: HomeViewPage
  counterpartyId?: string
  employeeId?: string
  invoiceId?: string
  projectId?: string
  warehouseId?: string
}) {
  const { t } = useTranslation()
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
  const shell = useHomeViewShellController({
    copy,
    removeRecordMutation,
    resetWorkspaceMutation,
    signOutMutation,
    theme,
    toggleTheme,
  })
  const workspaceQuery = useDemoWorkspaceQuery()
  const systemLogQuery = useSystemLogQuery({ enabled: page === "transactions", filters: shell.systemLogFilters })
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

  if (!derived) {
    if (workspaceQuery.isPending) {
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

  return (
    <HomeViewSignedInShell
      breadcrumbItems={breadcrumbItems}
      copy={copy}
      deletePending={removeRecordMutation.isPending}
      page={page}
      pendingDelete={shell.pendingDelete}
      session={auth.session}
      sidebarCollapsed={shell.sidebarCollapsed}
      signOutPending={signOutMutation.isPending}
      signOutOpen={shell.signOutOpen}
      theme={theme}
      onConfirmDelete={() => void shell.confirmDelete()}
      onConfirmSignOut={() => void shell.confirmSignOut()}
      onPendingDeleteChange={shell.setPendingDelete}
      onSetSidebarCollapsed={shell.setSidebarCollapsed}
      onSignOutOpenChange={shell.setSignOutOpen}
      onThemeToggle={shell.handleThemeToggle}
    >
      <HomeViewPageContent
        copy={copy}
        derived={derived}
        detailTab={detailTab}
        page={page}
        selectedCounterparty={selectedCounterparty}
        selectedEmployee={selectedEmployee}
        selectedProject={selectedProject}
        selectedWarehouse={selectedWarehouse}
        session={auth.session}
        systemLogFilters={shell.systemLogFilters}
        systemLogState={{
          entries: systemLogQuery.data?.items ?? [],
          isError: Boolean(systemLogQuery.error),
          isLoading: systemLogQuery.isPending,
        }}
        t={t}
        theme={theme}
        resetWorkspacePending={resetWorkspaceMutation.isPending}
        updateAccountPending={updateAccountSettingsMutation.isPending}
        navigation={navigation}
        onAddProject={navigation.goToProjectCreate}
        onAddWarehouse={navigation.goToWarehouseCreate}
        onResetWorkspace={shell.handleResetWorkspace}
        onSaveAccount={(input) => updateAccountSettingsMutation.mutateAsync(input)}
        onSetPendingDelete={shell.setPendingDelete}
        onSystemLogFiltersChange={shell.setSystemLogFilters}
        onThemeToggle={shell.handleThemeToggle}
      />
    </HomeViewSignedInShell>
  )
}
