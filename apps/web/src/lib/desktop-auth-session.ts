import { isTauri } from "@tauri-apps/api/core"

/**
 * Desktop auth session management for Tauri.
 */
let desktopAuthInitialized = false
let desktopAuthInitializationPromise: Promise<void> | null = null

const DESKTOP_AUTH_STORAGE_KEY = "tuari.desktop.auth.token"

/** Returns whether this window runs inside Tauri. */
export function isDesktopRuntime() {
  if (typeof window === "undefined") {
    return false
  }

  return isTauri()
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
