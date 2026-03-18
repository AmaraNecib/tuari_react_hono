// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getRuntimeStatus } from "./runtime-bridge"
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
  resolveApiBaseUrl,
  resolveAppClientKey,
} from "./runtime-config"

vi.mock("./runtime-bridge", () => ({
  getRuntimeStatus: vi.fn(),
}))

describe("runtime config", () => {
  beforeEach(() => {
    resetRuntimeConfigForTests()
    vi.mocked(getRuntimeStatus).mockReset()
  })

  it("uses desktop runtime values when the Tauri bridge provides them", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: {
        apiBaseUrl: "http://127.0.0.1:4318",
        appClientKey: "desktop-client-key",
      },
      error: null,
    })

    await initializeRuntimeConfig()

    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:4318")
    expect(resolveAppClientKey()).toBe("desktop-client-key")
  })

  it("keeps the existing defaults when the runtime bridge has no config", async () => {
    const initialApiBaseUrl = resolveApiBaseUrl()
    const initialAppClientKey = resolveAppClientKey()

    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "browser",
      endpoint: "Browser preview shell",
      health: "preview",
      config: null,
      error: null,
    })

    await initializeRuntimeConfig()

    expect(resolveApiBaseUrl()).toBe(initialApiBaseUrl)
    expect(resolveAppClientKey()).toBe(initialAppClientKey)
  })
})
