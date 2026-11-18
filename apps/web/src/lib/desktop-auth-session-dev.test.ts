// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:1420/" }

import { beforeEach, describe, expect, it, vi } from "vitest"
import { isDesktopRuntime } from "./desktop-auth-session"

describe("desktop auth detection on the Tauri dev URL", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("recognizes Tauri's official marker at localhost:1420", () => {
    vi.stubGlobal("isTauri", true)

    expect(window.location.origin).toBe("http://localhost:1420")
    expect(isDesktopRuntime()).toBe(true)
  })

  it("keeps an ordinary browser at the same localhost URL out of desktop mode", () => {
    expect(window.location.origin).toBe("http://localhost:1420")
    expect(isDesktopRuntime()).toBe(false)
  })
})
