/**
 * Bridge for Tauri update IPC commands.
 * Falls back gracefully when running in a browser preview.
 */

/**
 * Restart the application via Tauri IPC.
 * Uses the same dynamic-import-with-fallback pattern as desktop-api-bridge.ts.
 */
export async function restartApp(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restart_app");
  } catch (error) {
    // In browser preview, Tauri invoke is unavailable — that's expected.
    // In desktop mode, a real error (e.g., command not found) should surface.
    const message = error instanceof Error ? error.message : String(error);
    if (/tauri.*not (available|found)|unsupported in a web browser/i.test(message)) {
      return;
    }
    throw new Error(`Failed to restart the application: ${message}`);
  }
}
