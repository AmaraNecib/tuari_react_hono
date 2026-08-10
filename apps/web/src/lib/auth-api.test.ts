// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://tauri.localhost/" }

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.fn<typeof fetch>()
const isDesktopRuntimeMock = vi.fn(() => true)
const desktopApiFetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
const desktopBridgeChangePasswordMock = vi.fn<(...args: [Record<string, unknown>]) => Promise<void>>()
const desktopBridgeSignInWithPhoneNumberMock = vi.fn<(...args: [Record<string, unknown>]) => Promise<void>>()
const desktopBridgeSignOutSessionMock = vi.fn<() => Promise<void>>()

vi.mock("./desktop-api-bridge", () => ({
  desktopApiFetch: desktopApiFetchMock,
  desktopBridgeChangePassword: desktopBridgeChangePasswordMock,
  desktopBridgeSignInWithPhoneNumber: desktopBridgeSignInWithPhoneNumberMock,
  desktopBridgeSignOutSession: desktopBridgeSignOutSessionMock,
}))

vi.mock("./desktop-auth-session", () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))

vi.mock("./runtime-config", () => ({
  resolveApiBaseUrl: () => "http://localhost:3000",
  resolveApiUrl: (path: string) => new URL(path.replace(/^\//, ""), "http://localhost:3000/").toString(),
}))

describe("changeCurrentPassword", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    desktopApiFetchMock.mockReset()
    desktopBridgeChangePasswordMock.mockReset()
    desktopBridgeSignInWithPhoneNumberMock.mockReset()
    desktopBridgeSignOutSessionMock.mockReset()
    isDesktopRuntimeMock.mockReset()
    isDesktopRuntimeMock.mockReturnValue(true)
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("delegates desktop password changes to the native bridge", async () => {
    desktopBridgeChangePasswordMock.mockResolvedValue(undefined)

    const { changeCurrentPassword } = await import("./auth-api")

    await expect(
      changeCurrentPassword({
        currentPassword: "old-password",
        newPassword: "new-password-123",
        revokeOtherSessions: true,
      }),
    ).resolves.toEqual({ token: null })

    expect(desktopBridgeChangePasswordMock).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password-123",
      revokeOtherSessions: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses the desktop bridge for authenticated profile updates", async () => {
    desktopApiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: "user-1", name: "عمارة", phone: "0612345678" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { updateCurrentProfile } = await import("./auth-api")

    await expect(updateCurrentProfile({ name: "عمارة" })).resolves.toEqual({
      user: { id: "user-1", name: "عمارة", phone: "0612345678" },
    })

    expect(desktopApiFetchMock).toHaveBeenCalledWith("http://localhost:3000/api/auth/profile", {
      authenticated: true,
      body: JSON.stringify({ name: "عمارة" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  })
})

describe("signInDesktopWithPhoneNumber", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    desktopBridgeSignInWithPhoneNumberMock.mockReset()
    isDesktopRuntimeMock.mockReset()
    isDesktopRuntimeMock.mockReturnValue(true)
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("stores remembered desktop sign-ins through the native bridge", async () => {
    desktopBridgeSignInWithPhoneNumberMock.mockResolvedValue(undefined)

    const { signInDesktopWithPhoneNumber } = await import("./auth-api")

    await expect(
      signInDesktopWithPhoneNumber({
        phoneNumber: "0612345678",
        password: "password123",
        rememberMe: true,
      }),
    ).resolves.toEqual({ success: true })

    expect(desktopBridgeSignInWithPhoneNumberMock).toHaveBeenCalledWith({
      phoneNumber: "0612345678",
      password: "password123",
      rememberMe: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("extractAuthErrorMessage", () => {
  it("translates known better-auth messages to Arabic", async () => {
    const { extractAuthErrorMessage } = await import("./auth-api")

    expect(extractAuthErrorMessage(new Error("Invalid phone number or password"), "fallback")).toBe(
      "رقم الهاتف أو كلمة المرور غير صحيحة.",
    )
  })

  it("translates the better-auth client error-object shape used by the web path", async () => {
    const { extractAuthErrorMessage } = await import("./auth-api")

    expect(
      extractAuthErrorMessage(
        { message: "Invalid phone number or password", status: 400, statusText: "Bad Request" },
        "fallback",
      ),
    ).toBe("رقم الهاتف أو كلمة المرور غير صحيحة.")
  })

  it("translates plain string errors", async () => {
    const { extractAuthErrorMessage } = await import("./auth-api")

    expect(extractAuthErrorMessage("invalid credentials", "fallback")).toBe(
      "رقم الهاتف أو كلمة المرور غير صحيحة.",
    )
  })

  it("leaves unknown English messages unchanged", async () => {
    const { extractAuthErrorMessage } = await import("./auth-api")

    expect(extractAuthErrorMessage(new Error("Something went wrong"), "fallback")).toBe("Something went wrong")
  })

  it("is idempotent for already-translated Arabic messages", async () => {
    const { extractAuthErrorMessage } = await import("./auth-api")

    expect(extractAuthErrorMessage("رقم الهاتف أو كلمة المرور غير صحيحة.", "fallback")).toBe(
      "رقم الهاتف أو كلمة المرور غير صحيحة.",
    )
  })

  it("returns the untranslated fallback when nothing is extractable", async () => {
    const { extractAuthErrorMessage } = await import("./auth-api")

    expect(extractAuthErrorMessage(null, "رسالة احتياطية")).toBe("رسالة احتياطية")
    expect(extractAuthErrorMessage(undefined, "رسالة احتياطية")).toBe("رسالة احتياطية")
    expect(extractAuthErrorMessage({ status: 500 }, "رسالة احتياطية")).toBe("رسالة احتياطية")
  })
})

describe("signOutDesktopSession", () => {
  beforeEach(() => {
    desktopBridgeSignOutSessionMock.mockReset()
    isDesktopRuntimeMock.mockReset()
    isDesktopRuntimeMock.mockReturnValue(true)
  })

  it("delegates desktop sign-out to the native bridge", async () => {
    desktopBridgeSignOutSessionMock.mockResolvedValue(undefined)

    const { signOutDesktopSession } = await import("./auth-api")

    await expect(signOutDesktopSession()).resolves.toBeUndefined()
    expect(desktopBridgeSignOutSessionMock).toHaveBeenCalledTimes(1)
  })
})
