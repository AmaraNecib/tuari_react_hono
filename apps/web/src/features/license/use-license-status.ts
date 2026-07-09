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
      // In browser preview mode, assume no Tauri bridge
      const message =
        error instanceof Error ? error.message : String(error)

      // Gracefully degrade in browser preview
      if (
        message.toLowerCase().includes("tauri") ||
        message.toLowerCase().includes("invoke") ||
        message.toLowerCase().includes("browser")
      ) {
        setState({
          loading: false,
          status: null,
          error: null,
        })
        return null
      }

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
