/**
 * Hook for checking for updates via the Tauri IPC command.
 * Caches the last check result in localStorage for offline display.
 */
import { useCallback, useState } from "react"

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date"; checkedAt: string; offline?: boolean }
  | { status: "update-available"; latestVersion: string; downloadUrl: string; checkedAt: string; offline?: boolean }
  | { status: "error"; message: string }

export type UpdateCheckResult = {
  updateAvailable: boolean
  latestVersion: string
  downloadUrl: string
}

const CACHE_KEY = "tuari-update-check-cache"

function getCachedResult(): UpdateCheckState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UpdateCheckResult & { checkedAt: string }
    if (!parsed.checkedAt) return null
    if (parsed.updateAvailable) {
      // Validate cached fields are non-empty strings to prevent "undefined" in UI
      if (typeof parsed.latestVersion !== 'string' || !parsed.latestVersion) return null
      if (typeof parsed.downloadUrl !== 'string') return null
      return {
        status: "update-available",
        latestVersion: parsed.latestVersion,
        downloadUrl: parsed.downloadUrl,
        checkedAt: parsed.checkedAt,
      }
    }
    return { status: "up-to-date", checkedAt: parsed.checkedAt }
  } catch {
    return null
  }
}

function cacheResult(result: UpdateCheckResult) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...result, checkedAt: new Date().toISOString() }),
    )
  } catch {
    // localStorage may be full or unavailable
  }
}

// ─── Check for Updates Hook ────────────────────────────────────────

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateCheckState>(() => {
    const cached = getCachedResult()
    return cached ?? { status: "idle" }
  })

  const checkUpdate = useCallback(async () => {
    setState({ status: "checking" })

    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const result = await invoke<UpdateCheckResult>("check_for_updates")

      // Validate IPC result fields before caching or updating state
      if (result.updateAvailable) {
        if (typeof result.latestVersion !== 'string' || !result.latestVersion) {
          setState({ status: "error", message: "" })
          return
        }
        cacheResult(result)
        setState({
          status: "update-available",
          latestVersion: result.latestVersion,
          downloadUrl: result.downloadUrl ?? '',
          checkedAt: new Date().toISOString(),
        })
      } else {
        cacheResult(result)
        setState({ status: "up-to-date", checkedAt: new Date().toISOString() })
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ""

      // If we have a cached result, show it with offline flag
      const cached = getCachedResult()
      if (cached) {
        if (cached.status === "up-to-date") {
          setState({ status: "up-to-date", checkedAt: cached.checkedAt, offline: true })
        } else if (cached.status === "update-available") {
          setState({
            status: "update-available",
            latestVersion: cached.latestVersion,
            downloadUrl: cached.downloadUrl,
            checkedAt: cached.checkedAt,
            offline: true,
          })
        }
        return
      }

      setState({ status: "error", message })
    }
  }, [])

  return { state, checkUpdate }
}
