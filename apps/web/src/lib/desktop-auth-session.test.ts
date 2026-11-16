// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:1420/" }

import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadDesktopAuthSessionModule() {
  return import("./desktop-auth-session")
}

describe("desktop auth session bootstrap", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    window.localStorage.clear()
  })

  it("recognizes the normal localhost Tauri development WebView by its native marker", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} })

    const desktopAuthSession = await loadDesktopAuthSessionModule()

    expect(desktopAuthSession.isDesktopRuntime()).toBe(true)
  })

  it("does not classify a plain localhost browser as desktop", async () => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__

    const desktopAuthSession = await loadDesktopAuthSessionModule()

    expect(desktopAuthSession.isDesktopRuntime()).toBe(false)
  })

  it("recognizes the packaged Tauri runtime host", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://tauri.localhost/"),
    })

    const desktopAuthSession = await loadDesktopAuthSessionModule()

    expect(desktopAuthSession.isDesktopRuntime()).toBe(true)
  })

  it("returns false when no window exists", async () => {
    vi.stubGlobal("window", undefined)

    const desktopAuthSession = await loadDesktopAuthSessionModule()

    expect(desktopAuthSession.isDesktopRuntime()).toBe(false)
  })

  it("clears legacy desktop browser token storage during initialization", async () => {
    window.localStorage.setItem("tuari.desktop.auth.token", "legacy-token")

    const desktopAuthSession = await loadDesktopAuthSessionModule()
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBeNull()
  })

  it("initializes only once per module instance", async () => {
    window.localStorage.setItem("tuari.desktop.auth.token", "legacy-token")

    const desktopAuthSession = await loadDesktopAuthSessionModule()
    await desktopAuthSession.initializeDesktopAuthSession()
    window.localStorage.setItem("tuari.desktop.auth.token", "another-token")
    await desktopAuthSession.initializeDesktopAuthSession()

    expect(window.localStorage.getItem("tuari.desktop.auth.token")).toBe("another-token")
  })
})
