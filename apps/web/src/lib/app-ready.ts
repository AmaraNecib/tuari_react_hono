/**
 * Signals the Tauri backend that the app shell's first data load has
 * settled and it is ready to be shown: the backend closes the splashscreen
 * window and reveals the (hidden) main window.
 *
 * Deliberately failure-tolerant — the splashscreen is cosmetic. In browser
 * preview (`__TAURI_INTERNALS__` absent) or on any IPC error this is a
 * no-op and must never break the shell.
 */
export async function notifyAppReady(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("app_ready")
  } catch {
    // Browser preview or transient IPC failure — nothing to surface.
  }
}
