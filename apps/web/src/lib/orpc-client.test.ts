// @vitest-environment jsdom

import { createORPCClient } from "@orpc/client"
import type { ExactWorkforceEarningsClient } from "@tuari/contracts"
import { createWorkspaceRpcLink } from "./orpc-client"
import { describe, expect, it, vi } from "vitest"

const { isDesktopRuntimeMock } = vi.hoisted(() => ({ isDesktopRuntimeMock: vi.fn(() => true) }))

vi.mock("@/lib/desktop-api-bridge", () => ({
  desktopApiFetch: vi.fn(),
}))

vi.mock("@/lib/desktop-auth-session", () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))

vi.mock("@/lib/runtime-config", () => ({
  resolveApiBaseUrl: () => "http://localhost:3000",
  resolveApiUrl: (path: string) => `http://localhost:3000/${path}`,
}))

describe("workspace RPC transport", () => {
  it.each(["https://foreign.example/rpc", "//foreign.example/rpc", "../rpc", "rpc/../other", ""])("refuses a mount outside the configured workspace: %s", mount => {
    expect(() => createWorkspaceRpcLink(mount)).toThrow("RPC mount must be a relative workspace path")
  })
  it.each([false, true])("keeps the agreed exact mount in the configured workspace with desktop=%s", async desktop => {
    isDesktopRuntimeMock.mockReturnValue(desktop)
    const { desktopApiFetch } = await import("@/lib/desktop-api-bridge")
    const response = () => new Response(JSON.stringify({ json: [] }), { headers: { "content-type": "application/json" } })
    const browserFetch = vi.fn<typeof fetch>(async () => response())
    vi.stubGlobal("fetch", browserFetch)
    vi.mocked(desktopApiFetch).mockResolvedValueOnce(response())
    try {
      const link = createWorkspaceRpcLink(desktop ? "/agreed-exact-mount" : "agreed-exact-mount")
      const client: ExactWorkforceEarningsClient = createORPCClient(link)
      expect(await client.listEmployeeEarnings({ employeeId: "current-employee" })).toEqual([])
      const calls = desktop ? vi.mocked(desktopApiFetch).mock.calls : browserFetch.mock.calls
      const request = calls.at(-1)![0] as Request
      expect(request.url).toBe("http://localhost:3000/agreed-exact-mount/listEmployeeEarnings")
      if (desktop) expect(vi.mocked(desktopApiFetch).mock.lastCall![1]).toMatchObject({ authenticated: true })
      else expect(browserFetch.mock.lastCall![1]).toMatchObject({ credentials: "include" })
    } finally { vi.unstubAllGlobals(); vi.mocked(desktopApiFetch).mockReset() }
  })
})

describe("resolveRpcCredentials", () => {
  it("omits cookies in desktop runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    const { resolveRpcCredentials } = await import("./orpc-client")

    expect(resolveRpcCredentials()).toBe("omit")
  })

  it("includes cookies in browser runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(false)
    const { resolveRpcCredentials } = await import("./orpc-client")

    expect(resolveRpcCredentials()).toBe("include")
  })
})
