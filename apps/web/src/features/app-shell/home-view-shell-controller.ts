import { useRef, useState } from "react"

import { showSuccessToast } from "@/lib/toast"

import type { HomeViewCopy } from "./home-view-copy"
import type { useAppPreferences } from "@/features/preferences/preferences"
import type {
  useDemoSignOutMutation,
  useRemoveWorkspaceRecordMutation,
  useResetWorkspaceMutation,
} from "./mock-dashboard"
import type { HomeViewSystemLogFilters, PendingDelete } from "./home-view-types"
import { usePersistedSidebarState } from "./use-persisted-sidebar-state"

type Theme = ReturnType<typeof useAppPreferences>["theme"]
type ToggleTheme = ReturnType<typeof useAppPreferences>["toggleTheme"]
type RemoveRecordMutation = ReturnType<typeof useRemoveWorkspaceRecordMutation>
type SignOutMutation = ReturnType<typeof useDemoSignOutMutation>
type ResetWorkspaceMutation = ReturnType<typeof useResetWorkspaceMutation>

/** Manages shell state: sidebar, delete dialog, sign-out dialog. */
export function useHomeViewShellController({
  copy,
  removeRecordMutation,
  resetWorkspaceMutation,
  signOutMutation,
  theme,
  toggleTheme,
}: {
  copy: HomeViewCopy
  removeRecordMutation: RemoveRecordMutation
  resetWorkspaceMutation: ResetWorkspaceMutation
  signOutMutation: SignOutMutation
  theme: Theme
  toggleTheme: ToggleTheme
}) {
  const [systemLogFilters, setSystemLogFilters] = useState<HomeViewSystemLogFilters>({})
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedSidebarState()
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const deleteInFlightRef = useRef(false)
  const signOutInFlightRef = useRef(false)
  const resetWorkspaceInFlightRef = useRef(false)

  function handleThemeToggle() {
    toggleTheme()
    showSuccessToast(theme === "light" ? copy.toasts.themeDark : copy.toasts.themeLight)
  }

  async function confirmDelete() {
    if (!pendingDelete || removeRecordMutation.isPending || deleteInFlightRef.current) {
      return
    }

    deleteInFlightRef.current = true

    try {
      await removeRecordMutation.mutateAsync({
        section: pendingDelete.section,
        id: pendingDelete.id,
      })

      setPendingDelete(null)
    } finally {
      deleteInFlightRef.current = false
    }
  }

  async function confirmSignOut() {
    if (signOutMutation.isPending || signOutInFlightRef.current) {
      return
    }

    signOutInFlightRef.current = true

    try {
      await signOutMutation.mutateAsync()
      setSignOutOpen(false)
    } finally {
      signOutInFlightRef.current = false
    }
  }

  function handleResetWorkspace() {
    if (resetWorkspaceMutation.isPending || resetWorkspaceInFlightRef.current) {
      return
    }

    resetWorkspaceInFlightRef.current = true
    resetWorkspaceMutation.mutate(undefined, {
      onSettled: () => {
        resetWorkspaceInFlightRef.current = false
      },
    })
  }

  return {
    confirmDelete,
    confirmSignOut,
    handleResetWorkspace,
    handleThemeToggle,
    pendingDelete,
    setPendingDelete,
    setSidebarCollapsed,
    setSignOutOpen,
    setSystemLogFilters,
    sidebarCollapsed,
    signOutOpen,
    systemLogFilters,
  }
}
