/**
 * React hooks for license status display.
 *
 * Calls the Tauri `get_license_status` IPC command on desktop,
 * or returns a default "no license" state in browser preview mode.
 */

import { useQuery } from "@tanstack/react-query";

// ─── Public types ───────────────────────────────────────────────

/** Raw license status data returned by the Tauri IPC command. */
export interface LicenseStatusData {
  edition: string
  issuedTo: string
  email: string
  features: string[]
  maxUsers: number
  validFrom: string
  validUntil: string | null
  licenseType: string
  status: string
  daysRemaining: number
}

// ─── Query key ─────────────────────────────────────────────────

export const licenseQueryKey = ["license", "status"] as const;

// ─── Default values (browser/fallback) ─────────────────────────

const DEFAULT_LICENSE: LicenseStatusData = {
  edition: "",
  issuedTo: "",
  email: "",
  features: [],
  maxUsers: 0,
  validFrom: "",
  validUntil: null,
  licenseType: "",
  status: "unavailable",
  daysRemaining: 0,
};

// ─── Fetch function ────────────────────────────────────────────

function isDesktopRuntime(): boolean {
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function fetchLicenseStatus(): Promise<LicenseStatusData> {
  if (!isDesktopRuntime()) {
    return DEFAULT_LICENSE;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<LicenseStatusData>("get_license_status");
  return result;
}

// ─── Hook ──────────────────────────────────────────────────────

/**
 * Reads the current license status from the Rust LicenseManager
 * via the Tauri IPC bridge.
 *
 * Falls back to a default "unavailable" state when running in a
 * browser preview or when the Tauri bridge is not reachable.
 */
export function useLicenseStatus() {
  return useQuery({
    queryKey: licenseQueryKey,
    queryFn: fetchLicenseStatus,
    retry: false,
    staleTime: 30_000, // 30 seconds — acceptable for a settings page
  });
}
