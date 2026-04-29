// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"

const isDesktopRuntimeMock = vi.fn(() => true)

vi.mock("@/lib/desktop-api-bridge", () => ({
  desktopApiFetch: vi.fn(),
}))

vi.mock("@/lib/desktop-auth-session", () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))

vi.mock("@/lib/runtime-config", () => ({
  resolveApiBaseUrl: () => "http://localhost:3000",
}))

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
