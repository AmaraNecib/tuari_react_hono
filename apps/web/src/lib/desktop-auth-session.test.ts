// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://tauri.localhost/" }

import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"

type RuntimeSession = {
  token: string
  rememberMe: boolean
}

let secureToken: string | null = null
let runtimeSession: RuntimeSession | null = null
let failingCommands = new Set<string>()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (failingCommands.has(command)) {
      throw new Error(`${command} failed`)
    }

    switch (command) {
      case "get_desktop_runtime_auth_session":
        return runtimeSession
      case "set_desktop_runtime_auth_session": {
        const token = typeof args?.token === "string" ? args.token.trim() : ""
        runtimeSession = token.length > 0
          ? { token, rememberMe: args?.rememberMe === true }
          : null
        return undefined
      }
      case "clear_desktop_runtime_auth_session":
        runtimeSession = null
        return undefined
      case "get_desktop_auth_token":
        return secureToken
      case "set_desktop_auth_token":
        secureToken = typeof args?.token === "string" ? args.token.trim() : null
        return undefined
      case "clear_desktop_auth_token":
        secureToken = null
        return undefined
      default:
        throw new Error(`Unhandled command: ${command}`)
    }
  }),
}))

async function loadDesktopAuthSessionModule() {
  return import("./desktop-auth-session")
}

const invokeMock = vi.mocked(invoke)

describe("desktop auth session storage", () => {
  beforeEach(() => {
    vi.resetModules()
    invokeMock.mockClear()
    secureToken = null
    runtimeSession = null
    failingCommands = new Set<string>()
    window.localStorage.clear()
  })

  it("stores non-remembered desktop sessions only in runtime memory", async () => {
    const desktopAuthSession = await loadDesktopAuthSessionModule()

    await desktopAuthSession.setDesktopBearerToken("  desktop-token  ", { rememberMe: false })

    expect(runtimeSession).toEqual({ token: "desktop-token", rememberMe: false })
    expect(secureToken).toBeNull()
    expect(invokeMock).toHaveBeenCalledWith("clear_desktop_auth_token", undefined)
    expect(desktopAuthSession.isDesktopSessionRemembered()).toBe(false)
    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBeNull()
  })

  it("persists remembered desktop sessions in secure storage and runtime memory", async () => {
    const desktopAuthSession = await loadDesktopAuthSessionModule()

    await desktopAuthSession.setDesktopBearerToken("  desktop-token  ", { rememberMe: true })

    expect(runtimeSession).toEqual({ token: "desktop-token", rememberMe: true })
    expect(secureToken).toBe("desktop-token")
    expect(desktopAuthSession.createDesktopAuthorizationHeader()).toEqual({
      authorization: "Bearer desktop-token",
    })
    expect(desktopAuthSession.isDesktopSessionRemembered()).toBe(true)
    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBeNull()
  })

  it("keeps a non-remembered session across reloads within the same app runtime", async () => {
    const firstModule = await loadDesktopAuthSessionModule()
    await firstModule.setDesktopBearerToken("desktop-token", { rememberMe: false })

    vi.resetModules()
    const reloadedModule = await loadDesktopAuthSessionModule()
    await reloadedModule.initializeDesktopAuthSession()

    expect(reloadedModule.getDesktopBearerToken()).toBe("desktop-token")
    expect(reloadedModule.isDesktopSessionRemembered()).toBe(false)
    expect(secureToken).toBeNull()
  })

  it("drops a non-remembered session after app restart", async () => {
    const firstModule = await loadDesktopAuthSessionModule()
    await firstModule.setDesktopBearerToken("desktop-token", { rememberMe: false })

    runtimeSession = null
    vi.resetModules()

    const restartedModule = await loadDesktopAuthSessionModule()
    await restartedModule.initializeDesktopAuthSession()

    expect(restartedModule.getDesktopBearerToken()).toBeNull()
    expect(restartedModule.createDesktopAuthorizationHeader()).toEqual({})
    expect(restartedModule.isDesktopSessionRemembered()).toBe(false)
  })

  it("restores remembered sessions after app restart by hydrating secure storage", async () => {
    secureToken = "saved-token"

    const desktopAuthSession = await loadDesktopAuthSessionModule()
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(desktopAuthSession.getDesktopBearerToken()).toBe("saved-token")
    expect(desktopAuthSession.isDesktopSessionRemembered()).toBe(true)
    expect(runtimeSession).toEqual({ token: "saved-token", rememberMe: true })
  })

  it("prefers the runtime session over secure storage during bootstrap", async () => {
    runtimeSession = { token: "runtime-token", rememberMe: false }
    secureToken = "saved-token"

    const desktopAuthSession = await loadDesktopAuthSessionModule()
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(desktopAuthSession.getDesktopBearerToken()).toBe("runtime-token")
    expect(desktopAuthSession.isDesktopSessionRemembered()).toBe(false)
    expect(invokeMock).not.toHaveBeenCalledWith("get_desktop_auth_token", undefined)
  })

  it("treats blank secure-store tokens as signed out", async () => {
    secureToken = "   "

    const desktopAuthSession = await loadDesktopAuthSessionModule()
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(desktopAuthSession.getDesktopBearerToken()).toBeNull()
    expect(desktopAuthSession.createDesktopAuthorizationHeader()).toEqual({})
  })

  it("clears the runtime and persisted desktop bearer token on sign out", async () => {
    const desktopAuthSession = await loadDesktopAuthSessionModule()

    await desktopAuthSession.setDesktopBearerToken("desktop-token", { rememberMe: true })
    await desktopAuthSession.clearDesktopBearerToken()

    expect(runtimeSession).toBeNull()
    expect(secureToken).toBeNull()
    expect(invokeMock).toHaveBeenCalledWith("clear_desktop_runtime_auth_session", undefined)
    expect(invokeMock).toHaveBeenCalledWith("clear_desktop_auth_token", undefined)
    expect(desktopAuthSession.getDesktopBearerToken()).toBeNull()
    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBeNull()
  })

  it("keeps the in-memory session if secure storage persistence fails", async () => {
    failingCommands = new Set(["set_desktop_auth_token"])

    const desktopAuthSession = await loadDesktopAuthSessionModule()

    await expect(desktopAuthSession.setDesktopBearerToken("desktop-token", { rememberMe: true })).resolves.toBeUndefined()

    expect(desktopAuthSession.getDesktopBearerToken()).toBe("desktop-token")
    expect(desktopAuthSession.isDesktopSessionRemembered()).toBe(true)
    expect(runtimeSession).toEqual({ token: "desktop-token", rememberMe: true })
    expect(secureToken).toBeNull()
    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBeNull()
  })

  it("does not fall back to browser storage when runtime and secure hydration fail", async () => {
    window.localStorage.setItem("tuari.desktop.auth.token", "fallback-token")
    failingCommands = new Set(["get_desktop_runtime_auth_session", "get_desktop_auth_token"])

    const desktopAuthSession = await loadDesktopAuthSessionModule()
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(desktopAuthSession.getDesktopBearerToken()).toBeNull()
    expect(desktopAuthSession.createDesktopAuthorizationHeader()).toEqual({})
    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBeNull()
  })

  it("hydrates from storage only once per module instance", async () => {
    secureToken = "saved-token"

    const desktopAuthSession = await loadDesktopAuthSessionModule()

    await desktopAuthSession.initializeDesktopAuthSession()
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(invokeMock.mock.calls.filter(([command]) => command === "get_desktop_runtime_auth_session")).toHaveLength(1)
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_desktop_auth_token")).toHaveLength(1)
    expect(desktopAuthSession.getDesktopBearerToken()).toBe("saved-token")
  })
})
