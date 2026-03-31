let desktopBearerToken: string | null = null
let desktopBearerTokenRememberMe = false
let desktopBearerTokenInitialized = false
let desktopBearerTokenInitializationPromise: Promise<void> | null = null

const DESKTOP_AUTH_STORAGE_KEY = "tuari.desktop.auth.token"

export function isDesktopRuntime() {
  if (typeof window === "undefined") {
    return false
  }

  return window.location.hostname === "tauri.localhost" || window.location.protocol === "tauri:"
}

async function invokeDesktopAuthCommand<TResponse>(command: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<TResponse>(command, args)
}

type DesktopRuntimeAuthSession = {
  token: string
  rememberMe: boolean
}

function clearLegacyDesktopBrowserToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY)
  }
}

async function persistDesktopBearerToken(token: string | null, rememberMe: boolean) {
  clearLegacyDesktopBrowserToken()

  if (!isDesktopRuntime()) {
    return
  }

  try {
    if (token && rememberMe) {
      await invokeDesktopAuthCommand("set_desktop_auth_token", { token })
      return
    }

    await invokeDesktopAuthCommand("clear_desktop_auth_token")
  } catch {
    // Ignore storage failures and keep the in-memory session.
  }
}

async function persistDesktopRuntimeSession(token: string | null, rememberMe: boolean) {
  clearLegacyDesktopBrowserToken()

  if (!isDesktopRuntime()) {
    return
  }

  try {
    if (token) {
      await invokeDesktopAuthCommand("set_desktop_runtime_auth_session", { token, rememberMe })
      return
    }

    await invokeDesktopAuthCommand("clear_desktop_runtime_auth_session")
  } catch {
    // Ignore runtime persistence failures and keep the in-memory session.
  }
}

export async function initializeDesktopAuthSession() {
  if (desktopBearerTokenInitialized) {
    return
  }

  if (desktopBearerTokenInitializationPromise) {
    return desktopBearerTokenInitializationPromise
  }

  desktopBearerTokenInitializationPromise = (async () => {
    clearLegacyDesktopBrowserToken()

    try {
      if (!isDesktopRuntime()) {
        desktopBearerToken = null
        desktopBearerTokenRememberMe = false
        return
      }

      try {
        const runtimeSession = await invokeDesktopAuthCommand<DesktopRuntimeAuthSession | null>("get_desktop_runtime_auth_session")
        const runtimeToken = runtimeSession?.token?.trim() ?? ""

        if (runtimeToken.length > 0) {
          desktopBearerToken = runtimeToken
          desktopBearerTokenRememberMe = runtimeSession?.rememberMe === true
          return
        }
      } catch {
        // Ignore runtime hydration failures and fall back to secure storage.
      }

      try {
        const storedToken = await invokeDesktopAuthCommand<string | null>("get_desktop_auth_token")
        const normalizedToken = storedToken?.trim() ?? ""
        desktopBearerToken = normalizedToken.length > 0 ? normalizedToken : null
        desktopBearerTokenRememberMe = desktopBearerToken !== null

        if (desktopBearerToken) {
          await persistDesktopRuntimeSession(desktopBearerToken, true)
        }
      } catch {
        desktopBearerToken = null
        desktopBearerTokenRememberMe = false
      }
    } finally {
      desktopBearerTokenInitialized = true
      desktopBearerTokenInitializationPromise = null
    }
  })()

  return desktopBearerTokenInitializationPromise
}

export function getDesktopBearerToken() {
  return desktopBearerToken
}

export function isDesktopSessionRemembered() {
  return desktopBearerTokenRememberMe
}

export async function setDesktopBearerToken(token: string, options?: { rememberMe?: boolean }) {
  const value = token.trim()
  desktopBearerToken = value.length > 0 ? value : null
  desktopBearerTokenRememberMe = desktopBearerToken !== null && options?.rememberMe === true
  desktopBearerTokenInitialized = true
  await persistDesktopRuntimeSession(desktopBearerToken, desktopBearerTokenRememberMe)
  await persistDesktopBearerToken(desktopBearerToken, desktopBearerTokenRememberMe)
}

export async function clearDesktopBearerToken() {
  desktopBearerToken = null
  desktopBearerTokenRememberMe = false
  desktopBearerTokenInitialized = true
  await persistDesktopRuntimeSession(null, false)
  await persistDesktopBearerToken(null, false)
}

export function createDesktopAuthorizationHeader() {
  const token = getDesktopBearerToken()

  if (!token) {
    return {} as Record<string, string>
  }

  return {
    authorization: `Bearer ${token}`,
  } satisfies Record<string, string>
}
