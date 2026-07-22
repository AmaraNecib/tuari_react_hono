import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "tuari:restart-pending"

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
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
