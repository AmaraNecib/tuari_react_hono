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

  it.each([false, true])("uses the authenticated financial metadata path, desktop=%s", async (desktop) => {
    vi.stubGlobal("isTauri", desktop)
    const metadata = { roles: [], employees: [], externalCounterparties: [], projects: [], warehouses: [], managerAssignments: [], projectAssignments: [], warehouseAssignments: [], employeeStateHistory: [], projectManagerOwnershipHistory: [], warehouseManagerOwnershipHistory: [] }
    const response = new Response(JSON.stringify({ json: metadata }), { headers: { "content-type": "application/json" } })
    const browserFetch = vi.fn().mockResolvedValueOnce(response)
    vi.stubGlobal("fetch", browserFetch)
    if (desktop) vi.mocked(desktopApiFetch).mockResolvedValueOnce(response)
    const { financialClient } = await import("./orpc-client")

    await expect(financialClient.metadata()).resolves.toEqual(metadata)

    const transport = desktop ? vi.mocked(desktopApiFetch) : browserFetch
    expect(transport).toHaveBeenCalledOnce()
    expect(transport.mock.calls[0]?.[0]).toHaveProperty("url", "http://127.0.0.1:4318/rpc/financial/metadata")
    expect(transport.mock.calls[0]?.[1]).toMatchObject(desktop ? { authenticated: true } : { credentials: "include" })
    expect(desktop ? browserFetch : desktopApiFetch).not.toHaveBeenCalled()
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
