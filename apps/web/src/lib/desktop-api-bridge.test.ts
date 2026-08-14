// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://tauri.localhost/" }

import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: Array.from(new TextEncoder().encode('{"ok":true}')),
  })),
}))

vi.mock("./desktop-auth-session", () => ({
  isDesktopRuntime: vi.fn(() => true),
}))

vi.mock("./runtime-config", () => ({
  resolveApiBaseUrl: () => "http://127.0.0.1:4318",
}))

const invokeMock = vi.mocked(invoke)

describe("desktopApiFetch", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: Array.from(new TextEncoder().encode('{"ok":true}')),
    })
  })

  it("serializes local API requests for the native bridge", async () => {
    const { desktopApiFetch } = await import("./desktop-api-bridge")

    const response = await desktopApiFetch("http://127.0.0.1:4318/rpc?batch=1", {
      authenticated: true,
      body: "{}",
      headers: {
        authorization: "Bearer leaked-token",
        "content-type": "application/json",
      },
      method: "POST",
    })

    expect(invokeMock).toHaveBeenCalledWith("desktop_api_request", {
      request: expect.objectContaining({
        authenticated: true,
        body: [123, 125],
        headers: { "content-type": "application/json" },
        method: "POST",
        path: "/rpc?batch=1",
      }),
    })
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("rejects requests outside the configured API origin", async () => {
    const { desktopApiFetch } = await import("./desktop-api-bridge")

    await expect(
      desktopApiFetch("https://example.com/evil", { authenticated: true }),
    ).rejects.toThrow("configured API origin")
  })

  it("normalizes non-Error bridge failures into Error instances", async () => {
    invokeMock.mockRejectedValueOnce("native bridge failed")

    const { desktopBridgeSignOutSession } = await import("./desktop-api-bridge")

    await expect(desktopBridgeSignOutSession()).rejects.toMatchObject({
      message: "native bridge failed",
    })
  })

  it("preserves the native delivery phase when normalizing structured bridge failures", async () => {
    invokeMock.mockRejectedValueOnce({
      message: "response body read failed",
      desktopBridge: {
        kind: "desktop-api-bridge",
        phase: "response-body-read",
      },
    })

    const { desktopApiFetch } = await import("./desktop-api-bridge")

    await expect(desktopApiFetch("http://127.0.0.1:4318/rpc")).rejects.toMatchObject({
      message: "response body read failed",
      desktopBridge: {
        kind: "desktop-api-bridge",
        phase: "response-body-read",
      },
    })
  })

  it("marks request-construction failures as pre-delivery (the invoke never ran)", async () => {
    const { desktopApiFetch } = await import("./desktop-api-bridge")

    await expect(
      desktopApiFetch("https://example.com/evil", { authenticated: true }),
    ).rejects.toMatchObject({
      desktopBridge: {
        kind: "desktop-api-bridge",
        phase: "pre-delivery",
      },
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("falls back to the unknown phase when the native marker is invalid", async () => {
    invokeMock.mockRejectedValueOnce({
      message: "mangled failure",
      desktopBridge: {
        kind: "some-other-kind",
        phase: "response-body-read",
      },
    })

    const { desktopApiFetch } = await import("./desktop-api-bridge")

    await expect(desktopApiFetch("http://127.0.0.1:4318/rpc")).rejects.toMatchObject({
      message: "mangled failure",
      desktopBridge: {
        kind: "desktop-api-bridge",
        phase: "unknown",
      },
    })
  })
})
