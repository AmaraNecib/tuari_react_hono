/**
 * Hook for persisting sidebar collapsed state in localStorage.
 * Maintains sidebar state across page reloads.
 */
import { useEffect, useState, useRef } from "react"

const SIDEBAR_COLLAPSED_STORAGE_KEY = "tuari.workspace.sidebar.collapsed"

function readStoredSidebarCollapsed() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)

    if (storedValue === "true") {
      return true
    }

    if (storedValue === "false") {
      return false
    }
  } catch {
    return null
  }

  return null
}

function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
  } catch {
    // Ignore storage failures and keep the current UI state.
  }
}

function getInitialSidebarCollapsedState() {
  if (typeof window === "undefined") {
    return false
  }

  return readStoredSidebarCollapsed() ?? window.innerWidth < 1200
}

/**
 * usePersistedSidebarState() component.
 */
export function usePersistedSidebarState() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsedState)
  const isForcedCollapsed = useRef(false)

  useEffect(() => {
    function syncSidebarForViewport() {
      if (window.innerWidth < 1200) {
        isForcedCollapsed.current = true
        setSidebarCollapsed(true)
      } else {
        isForcedCollapsed.current = false
      }
    }

    syncSidebarForViewport()
    window.addEventListener("resize", syncSidebarForViewport)

    return () => window.removeEventListener("resize", syncSidebarForViewport)
  }, [])

  useEffect(() => {
    if (!isForcedCollapsed.current) {
      persistSidebarCollapsed(sidebarCollapsed)
    }
  }, [sidebarCollapsed])

  return [sidebarCollapsed, setSidebarCollapsed] as const
}
