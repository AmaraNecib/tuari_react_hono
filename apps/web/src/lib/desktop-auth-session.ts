let desktopBearerToken: string | null = null

export function isDesktopRuntime() {
  if (typeof window === "undefined") {
    return false
  }

  return window.location.hostname === "tauri.localhost" || window.location.protocol === "tauri:"
}

export function getDesktopBearerToken() {
  return desktopBearerToken
}

export function setDesktopBearerToken(token: string) {
  const value = token.trim()
  desktopBearerToken = value.length > 0 ? value : null
}

export function clearDesktopBearerToken() {
  desktopBearerToken = null
}

export function createDesktopAuthorizationHeader() {
  if (!desktopBearerToken) {
    return {} as Record<string, string>
  }

  return {
    authorization: `Bearer ${desktopBearerToken}`,
  } satisfies Record<string, string>
}
