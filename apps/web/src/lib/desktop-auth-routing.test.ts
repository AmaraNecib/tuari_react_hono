// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:1420/" }

import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "desktop_api_request") {
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: Array.from(new TextEncoder().encode('{"user":null}')),
      }
    }
    return undefined
  }),
}))

vi.mock("./runtime-config", () => ({
  resolveApiBaseUrl: () => "http://127.0.0.1:4318",
  resolveApiUrl: (path: string) => `http://127.0.0.1:4318/${path.startsWith("/") ? path.slice(1) : path}`,
}))

const invokeMock = vi.mocked(invoke)

describe("localhost Tauri auth transport selection", () => {
  beforeEach(() => {
    invokeMock.mockClear()
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} })
  })

  it("routes sign-in and authenticated RPC through the native session bridge", async () => {
    const { signInDesktopWithPhoneNumber } = await import("./auth-api")
    const { desktopApiFetch } = await import("./desktop-api-bridge")
    const { resolveRpcCredentials } = await import("./orpc-client")

    await signInDesktopWithPhoneNumber({ phoneNumber: "0612345678", password: "test-only" })
    await desktopApiFetch("http://127.0.0.1:4318/rpc/session", { authenticated: true })

    expect(resolveRpcCredentials()).toBe("omit")
    expect(invokeMock).toHaveBeenNthCalledWith(1, "desktop_sign_in_with_phone_number", {
      input: { phoneNumber: "0612345678", password: "test-only", rememberMe: false },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, "desktop_api_request", {
      request: expect.objectContaining({ authenticated: true, path: "/rpc/session" }),
    })
  })
})
