/**
 * React hooks for license status display.
 *
 * Calls the Tauri `get_license_status` IPC command on desktop,
 * or returns a default "no license" state in browser preview mode.
 */

import { useQuery } from "@tanstack/react-query";

// ─── Public types ───────────────────────────────────────────────

/** Raw license status data returned by the Tauri IPC command (M5.1 + M5.2 fields). */
export interface LicenseStatusData {
  edition: string
  editionLabel: string
  issuedTo: string
  email: string
  customerName: string | null
  features: string[]
  maxUsers: number
  hasLicense: boolean
  isGracePeriod: boolean
  isExpired: boolean
  isLocked: boolean
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
  editionLabel: "",
  issuedTo: "",
  email: "",
  customerName: null,
  features: [],
  maxUsers: 0,
  hasLicense: false,
  isGracePeriod: false,
  isExpired: false,
  isLocked: false,
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
