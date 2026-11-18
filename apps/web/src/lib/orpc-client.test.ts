// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:1420/" }

import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/desktop-api-bridge", () => ({
  desktopApiFetch: vi.fn(),
}))

vi.mock("@/lib/runtime-config", () => ({
  resolveApiBaseUrl: () => "http://localhost:3000",
}))

describe("resolveRpcCredentials", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("omits browser cookies for Tauri hosted on localhost", async () => {
    vi.stubGlobal("isTauri", true)
    const { resolveRpcCredentials } = await import("./orpc-client")

    expect(window.location.origin).toBe("http://localhost:1420")
    expect(resolveRpcCredentials()).toBe("omit")
  })

  it("includes cookies for a browser at the same localhost URL", async () => {
    vi.stubGlobal("isTauri", false)
    const { resolveRpcCredentials } = await import("./orpc-client")

    expect(window.location.origin).toBe("http://localhost:1420")
    expect(resolveRpcCredentials()).toBe("include")
  })
})
