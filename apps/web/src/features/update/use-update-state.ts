import { useCallback, useEffect, useSyncExternalStore } from "react"

const STORAGE_KEY = "tuari:restart-pending"
const SESSION_KEY = "tuari:restart-session-started"

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

function initializeSession(): void {
  try {
    // sessionStorage is cleared when the desktop webview starts again, while
    // localStorage survives. Use that boundary to discard a stale deferred
    // restart flag left behind by a manual app restart.
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      return
    }

    sessionStorage.setItem(SESSION_KEY, "true")
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))
  } catch {
    // Browser storage unavailable — no session initialization or persistence.
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback)
  return () => window.removeEventListener("storage", callback)
}

/**
 * Hook that tracks whether a restart is pending (update applied, waiting for
 * user to restart). Persisted in localStorage so the badge survives page
 * navigation and only disappears on actual restart.
 */
export type UseRestartPendingReturn = Readonly<{
  pending: boolean
  setPending: (value: boolean) => void
}>

export function useRestartPending(): UseRestartPendingReturn {
  const pending = useSyncExternalStore(subscribe, getSnapshot, () => false)

  useEffect(() => {
    initializeSession()
  }, [])

  const setPending = useCallback((value: boolean) => {
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, "true")
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
      // Dispatch a storage event so other tabs/hooks react
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))
    } catch {
      // localStorage unavailable — no persistence
    }
  }, [])

  return { pending, setPending } as const
}
