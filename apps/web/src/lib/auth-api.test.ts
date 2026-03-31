// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://tauri.localhost/" }

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.fn<typeof fetch>()
const isDesktopRuntimeMock = vi.fn(() => true)
const isDesktopSessionRememberedMock = vi.fn(() => false)
const setDesktopBearerTokenMock = vi.fn<(...args: [string, { rememberMe?: boolean }?]) => Promise<void>>()

vi.mock("./desktop-auth-session", () => ({
  clearDesktopBearerToken: vi.fn(),
  createDesktopAuthorizationHeader: vi.fn(() => ({ authorization: "Bearer current-token" })),
  isDesktopRuntime: isDesktopRuntimeMock,
  isDesktopSessionRemembered: isDesktopSessionRememberedMock,
  setDesktopBearerToken: setDesktopBearerTokenMock,
}))

vi.mock("./runtime-config", () => ({
  resolveApiBaseUrl: () => "http://localhost:3000",
  resolveApiUrl: (path: string) => new URL(path.replace(/^\//, ""), "http://localhost:3000/").toString(),
}))

describe("changeCurrentPassword", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    isDesktopRuntimeMock.mockReset()
    isDesktopRuntimeMock.mockReturnValue(true)
    isDesktopSessionRememberedMock.mockReset()
    isDesktopSessionRememberedMock.mockReturnValue(false)
    setDesktopBearerTokenMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("updates the desktop bearer token when password change rotates it", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "rotated-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { changeCurrentPassword } = await import("./auth-api")

    await expect(
      changeCurrentPassword({
        currentPassword: "old-password",
        newPassword: "new-password-123",
        revokeOtherSessions: true,
      }),
    ).resolves.toEqual({ token: "rotated-token" })

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer current-token",
      },
      credentials: "omit",
      body: JSON.stringify({
        currentPassword: "old-password",
        newPassword: "new-password-123",
        revokeOtherSessions: true,
      }),
    })
    expect(setDesktopBearerTokenMock).toHaveBeenCalledWith("rotated-token", { rememberMe: false })
  })

  it("does not overwrite desktop auth state when no rotated token is returned", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { changeCurrentPassword } = await import("./auth-api")

    await expect(
      changeCurrentPassword({
        currentPassword: "old-password",
        newPassword: "new-password-123",
      }),
    ).resolves.toEqual({ token: null })

    expect(setDesktopBearerTokenMock).not.toHaveBeenCalled()
  })

  it("preserves rememberMe semantics when password change rotates the desktop token", async () => {
    isDesktopSessionRememberedMock.mockReturnValue(true)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "rotated-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { changeCurrentPassword } = await import("./auth-api")

    await changeCurrentPassword({
      currentPassword: "old-password",
      newPassword: "new-password-123",
    })

    expect(setDesktopBearerTokenMock).toHaveBeenCalledWith("rotated-token", { rememberMe: true })
  })
})

describe("signInDesktopWithPhoneNumber", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    setDesktopBearerTokenMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("stores remembered desktop sign-ins in persisted auth storage", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "desktop-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { signInDesktopWithPhoneNumber } = await import("./auth-api")

    await signInDesktopWithPhoneNumber({
      phoneNumber: "0612345678",
      password: "password123",
      rememberMe: true,
    })

    expect(setDesktopBearerTokenMock).toHaveBeenCalledWith("desktop-token", { rememberMe: true })
  })

  it("keeps non-remembered desktop sign-ins runtime-only", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "desktop-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { signInDesktopWithPhoneNumber } = await import("./auth-api")

    await signInDesktopWithPhoneNumber({
      phoneNumber: "0612345678",
      password: "password123",
      rememberMe: false,
    })

    expect(setDesktopBearerTokenMock).toHaveBeenCalledWith("desktop-token", { rememberMe: false })
  })

  it("uses non-cookie desktop requests for desktop sign-in", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "desktop-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { signInDesktopWithPhoneNumber } = await import("./auth-api")

    await signInDesktopWithPhoneNumber({
      phoneNumber: "0612345678",
      password: "password123",
      rememberMe: false,
    })

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/auth/sign-in/phone-number", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({
        phoneNumber: "0612345678",
        password: "password123",
        rememberMe: false,
      }),
    })
  })
})
