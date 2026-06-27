/**
 * Desktop auth session management for Electron/Tauri.
 */
let desktopAuthInitialized = false
let desktopAuthInitializationPromise: Promise<void> | null = null

const DESKTOP_AUTH_STORAGE_KEY = "tuari.desktop.auth.token"

export function isDesktopRuntime() {
  if (typeof window === "undefined") {
    return false
  }

  return window.location.hostname === "tauri.localhost" || window.location.protocol === "tauri:"
}

function clearLegacyDesktopBrowserToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY)
  }
}

export async function initializeDesktopAuthSession() {
  if (desktopAuthInitialized) {
    return
  }

  if (desktopAuthInitializationPromise) {
    return desktopAuthInitializationPromise
  }

  desktopAuthInitializationPromise = (async () => {
    clearLegacyDesktopBrowserToken()
    desktopAuthInitialized = true
    desktopAuthInitializationPromise = null
  })()

  return desktopAuthInitializationPromise
}
