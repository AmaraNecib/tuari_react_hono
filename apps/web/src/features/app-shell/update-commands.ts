/**
 * Tauri IPC wrappers for update operations.
 * Only works in desktop (Tauri) runtime; gracefully degrades in browser mode.
 */

import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { i18n } from "@/i18n"

export type UpdateApplyResult = {
  success: boolean
  message: string
}

async function invokeTauriCommand<TResponse>(
  command: string,
  args?: Record<string, unknown>,
): Promise<TResponse> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<TResponse>(command, args)
}

/**
 * Get the current application version from the Tauri backend.
 * Returns null when running in browser/preview mode.
 */
export async function getCurrentVersion(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null
  }

  try {
    return await invokeTauriCommand<string>("get_current_version")
  } catch {
    return null
  }
}

/**
 * Open a native file picker filtered for `.update` files.
 * Returns the selected file path, or null if cancelled.
 */
export async function pickUpdateFile(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null
  }

  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: i18n.t("shellCopy.updateFiles"),
          extensions: ["update"],
        },
      ],
    })
    return selected ?? null
  } catch {
    return null
  }
}

/**
 * Apply an update from a `.update` file path.
 * Returns a failure result when running in browser/preview mode.
 */
export async function applyUpdate(path: string): Promise<UpdateApplyResult> {
  if (!isDesktopRuntime()) {
    return {
      success: false,
      message: i18n.t("shellCopy.desktopOnly"),
    }
  }

  const result = await invokeTauriCommand<UpdateApplyResult>("apply_update", {
    path,
  })
  return result
}
