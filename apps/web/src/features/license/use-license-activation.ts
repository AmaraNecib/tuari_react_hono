import { useState, useCallback } from "react"

export type LicenseActivationResult = {
  success: boolean
  edition: string
  editionLabel: string
  customerName: string
  customerEmail: string
  licenseType: string
  message: string
}

type ActivationState = {
  isActivating: boolean
  result: LicenseActivationResult | null
  error: string | null
}

/**
 * Hook to activate a license key via the Tauri IPC command.
 * Falls back gracefully in browser preview mode.
 */
export function useLicenseActivation() {
  const [state, setState] = useState<ActivationState>({
    isActivating: false,
    result: null,
    error: null,
  })

  const activateLicense = useCallback(async (key: string): Promise<LicenseActivationResult> => {
    setState((prev) => ({ ...prev, isActivating: true, error: null, result: null }))

    try {
      // Dynamic import to avoid breaking browser preview
      const { invoke } = await import("@tauri-apps/api/core")
      const result = await invoke<LicenseActivationResult>("activate_license", { key })

      setState({
        isActivating: false,
        result,
        error: null,
      })

      return result
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "فشل تفعيل الترخيص."

      setState({
        isActivating: false,
        result: null,
        error: message,
      })

      throw new Error(message)
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      isActivating: false,
      result: null,
      error: null,
    })
  }, [])

  return {
    ...state,
    activateLicense,
    reset,
  }
}
