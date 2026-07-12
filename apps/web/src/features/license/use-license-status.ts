import { useEffect, useState, useCallback } from "react"

export type LicenseStatus = {
  hasLicense: boolean
  status: string
  edition: string
  editionLabel: string
  customerName: string | null
  daysRemaining: number
  isGracePeriod: boolean
  isExpired: boolean
  isLocked: boolean
}

type StatusState = {
  loading: boolean
  status: LicenseStatus | null
  error: string | null
}

/**
 * Hook to get the current license status from the Tauri backend.
 * Falls back gracefully in browser preview mode.
 */
export function useLicenseStatus() {
  const [state, setState] = useState<StatusState>({
    loading: true,
    status: null,
    error: null,
  })

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    // Check if Tauri bridge is available before attempting IPC
    const isTauri =
      typeof window !== "undefined" &&
      "__TAURI_INTERNALS__" in window &&
      typeof (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined"

    if (!isTauri) {
      setState({ loading: false, status: null, error: null })
      return null
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const result = await invoke<LicenseStatus>("get_license_status")

      setState({
        loading: false,
        status: result,
        error: null,
      })

      return result
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)

      setState({
        loading: false,
        status: null,
        error: message,
      })
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    ...state,
    refresh,
  }
}
