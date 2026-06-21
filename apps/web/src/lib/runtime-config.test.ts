// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getRuntimeStatus } from "./runtime-bridge"
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
  resolveApiBaseUrl,
  resolveApiUrl,
} from "./runtime-config"

vi.mock("./runtime-bridge", () => ({
  getRuntimeStatus: vi.fn(),
}))

describe("runtime config", () => {
  beforeEach(() => {
    resetRuntimeConfigForTests()
    vi.mocked(getRuntimeStatus).mockReset()
  })

  it("uses the current localhost hostname for the default browser api base url", () => {
    // The implementation picks a default base URL at module-load time based on
    // the runtime's window.location. We don't assert on the specific hostname
    // (jsdom varies between 'localhost' and '127.0.0.1' across platforms and
    // import order), but on the structural shape: it must point at the
    // configured dev port 4318.
    const url = resolveApiBaseUrl()
    expect(url).toMatch(/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1):4318$/)
  })

  it("uses desktop runtime values when the Tauri bridge provides them", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: {
        apiBaseUrl: "http://127.0.0.1:4318",
      },
      error: null,
    })

    await initializeRuntimeConfig()

    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:4318")
  })

  it("keeps the existing defaults when the runtime bridge has no config", async () => {
    const initialApiBaseUrl = resolveApiBaseUrl()

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
  })

  it("normalizes trailing slashes from runtime config urls", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "browser",
      endpoint: "https://api.example.com",
      health: "connected",
      config: {
        apiBaseUrl: "https://api.example.com///",
      },
      error: null,
    })

    await initializeRuntimeConfig()

    expect(resolveApiBaseUrl()).toBe("https://api.example.com")
  })

  it("rejects invalid runtime api urls", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "browser",
      endpoint: "browser",
      health: "connected",
      config: {
        apiBaseUrl: "not-a-url",
      },
      error: null,
    })

    await expect(initializeRuntimeConfig()).rejects.toThrow("Invalid API base URL")
  })

  it("rejects insecure non-local runtime api urls", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "browser",
      endpoint: "browser",
      health: "connected",
      config: {
        apiBaseUrl: "http://api.example.com",
      },
      error: null,
    })

    await expect(initializeRuntimeConfig()).rejects.toThrow("API base URL must use https for non-local hosts")
  })

  it("rejects runtime api urls with credentials or fragments", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "browser",
      endpoint: "browser",
      health: "connected",
      config: {
        apiBaseUrl: "https://user:pass@example.com/path#hash",
      },
      error: null,
    })

    await expect(initializeRuntimeConfig()).rejects.toThrow("API base URL must not include credentials, query parameters, or fragments")
  })

  it("preserves configured base paths when resolving endpoint urls", async () => {
    vi.mocked(getRuntimeStatus).mockResolvedValue({
      checkedAt: "2026-03-17T20:00:00.000Z",
      environment: "browser",
      endpoint: "browser",
      health: "connected",
      config: {
        apiBaseUrl: "https://example.com/app",
      },
      error: null,
    })

    await initializeRuntimeConfig()

    expect(resolveApiUrl("/api/auth/session")).toBe("https://example.com/app/api/auth/session")
    expect(resolveApiUrl("rpc")).toBe("https://example.com/app/rpc")
  })
})
