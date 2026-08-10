import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The module under test imports @tauri-apps/api/core dynamically; the
// hoisted vi.mock intercepts both static and dynamic imports.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

import { invoke } from "@tauri-apps/api/core"
import { notifyAppReady } from "./app-ready"

const invokeMock = vi.mocked(invoke)

describe("notifyAppReady", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("invokes the app_ready command exactly once when running inside Tauri", async () => {
    invokeMock.mockResolvedValue(undefined)
    vi.stubGlobal("__TAURI_INTERNALS__", {})

    await notifyAppReady()

    expect(invokeMock).toHaveBeenCalledExactlyOnceWith("app_ready")
  })

  it("is a no-op in a browser preview without the Tauri runtime", async () => {
    // jsdom has no __TAURI_INTERNALS__ global by default.
    await notifyAppReady()

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("swallows IPC failures so the shell never breaks", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {})
    invokeMock.mockRejectedValue(new Error("ipc disconnected"))

    await expect(notifyAppReady()).resolves.toBeUndefined()
  })
})
