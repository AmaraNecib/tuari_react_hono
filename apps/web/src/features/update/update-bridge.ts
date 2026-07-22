/**
 * Bridge for Tauri update IPC commands.
 * Falls back gracefully when running in a browser preview.
 */

export type UpdateCheckResult = {
  updateAvailable: boolean;
  latestVersion: string;
  downloadUrl: string;
};

export type UpdateApplyResult = {
  success: boolean;
  message: string;
};

/**
 * Check for available updates via Tauri IPC.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<UpdateCheckResult>("check_for_updates");
    return result;
  } catch {
    // Running in browser preview — Tauri bridge unavailable
    return null;
  }
}

/**
 * Apply an update package at the given path via Tauri IPC.
 */
export async function applyUpdate(path: string): Promise<UpdateApplyResult | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<UpdateApplyResult>("apply_update", { path });
    return result;
  } catch {
    return null;
  }
}

/**
 * Restart the application via Tauri IPC.
 */
export async function restartApp(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restart_app");
  } catch {
    // Running in browser preview — no-op
  }
}
