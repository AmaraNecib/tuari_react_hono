import { isDesktopRuntime } from "./desktop-auth-session"

export const ERROR_CODE_PREFIX = "TUARI"

export function formatErrorCode(id: number): string {
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new RangeError("Invalid error ID")
  return `${ERROR_CODE_PREFIX}-${id.toString(16).toUpperCase().padStart(8, "0")}`
}

/** Resolve the numeric identifier without coupling support tools to a product name. */
export function resolveErrorId(code: string): number | null {
  const match = /^[A-Za-z][A-Za-z0-9_-]*-([0-9a-f]{8})$/i.exec(code)
  const digits = match?.[1]
  return digits === undefined ? null : Number.parseInt(digits, 16)
}

export function createErrorId(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!
}

/** Logging is local and best effort. No UI text crosses the native command. */
export async function recordUiFailure(id: number): Promise<void> {
  if (!isDesktopRuntime()) return
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("record_ui_failure", { id })
  } catch {
    // A failed logger must not trigger another error notification.
  }
}

/** Call once in the feedback-owning event handler, never during render. */
export function supportFailureMessage(safeMessage: string): string {
  const id = createErrorId()
  void recordUiFailure(id)
  return `${safeMessage}\n\u2066${formatErrorCode(id)}\u2069`
}
