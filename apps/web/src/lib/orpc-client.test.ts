// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:1420/" }

import { afterEach, describe, expect, it, vi } from "vitest"

import { desktopApiFetch } from "@/lib/desktop-api-bridge"

vi.mock("@/lib/desktop-api-bridge", () => ({
  desktopApiFetch: vi.fn(),
}))

vi.mock("@/lib/runtime-config", () => ({
  resolveApiUrl: (path: string) => `http://127.0.0.1:4318/${path}`,
}))

describe("RPC runtime routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
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

  it("dispatches localhost Tauri RPC through the authenticated native bridge", async () => {
    vi.stubGlobal("isTauri", true)
    const browserFetch = vi.fn()
    vi.stubGlobal("fetch", browserFetch)
    vi.mocked(desktopApiFetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ json: { status: "ok" } }),
      { headers: { "content-type": "application/json" } },
    ))
    const { rpcClient } = await import("./orpc-client")

    await rpcClient.health()

    expect(desktopApiFetch).toHaveBeenCalledOnce()
    expect(desktopApiFetch).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ authenticated: true }),
    )
    expect(browserFetch).not.toHaveBeenCalled()
  })

  it("dispatches ordinary localhost browser RPC through fetch with cookies", async () => {
    vi.stubGlobal("isTauri", false)
    const browserFetch = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ json: { status: "ok" } }),
      { headers: { "content-type": "application/json" } },
    ))
    vi.stubGlobal("fetch", browserFetch)
    const { rpcClient } = await import("./orpc-client")

    await rpcClient.health()

    expect(browserFetch).toHaveBeenCalledOnce()
    expect(browserFetch).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ credentials: "include" }),
    )
    expect(desktopApiFetch).not.toHaveBeenCalled()
  })
})
