// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://tauri.localhost/" }

import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadDesktopAuthSessionModule() {
  return import("./desktop-auth-session")
}

describe("desktop auth session bootstrap", () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
  })

  it("recognizes the Tauri runtime host", async () => {
    const desktopAuthSession = await loadDesktopAuthSessionModule()

    expect(desktopAuthSession.isDesktopRuntime()).toBe(true)
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
