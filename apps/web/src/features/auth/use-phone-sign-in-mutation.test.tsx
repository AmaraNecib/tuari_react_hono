// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getAuthClient } from "@/lib/auth-client"
import { signInDesktopWithPhoneNumber } from "@/lib/auth-api"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { createAppQueryClient } from "@/lib/query-client"
import { showErrorToast } from "@/lib/toast"
import { usePhoneSignInMutation } from "./use-phone-sign-in-mutation"

const phoneNumberSignInMock = vi.fn()

vi.mock("@/lib/auth-client", () => ({
  getAuthClient: vi.fn(() => ({
    signIn: {
      phoneNumber: phoneNumberSignInMock,
    },
  })),
}))

vi.mock("@/lib/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-api")>()
  return {
    ...actual,
    signInDesktopWithPhoneNumber: vi.fn(),
  }
})

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
}))

vi.mock("@/lib/desktop-auth-session", () => ({
  isDesktopRuntime: vi.fn(() => false),
}))

describe("usePhoneSignInMutation", () => {
  beforeEach(() => {
    phoneNumberSignInMock.mockReset()
    vi.mocked(getAuthClient).mockClear()
    vi.mocked(signInDesktopWithPhoneNumber).mockReset()
    vi.mocked(isDesktopRuntime).mockReturnValue(false)
    vi.mocked(showErrorToast).mockReset()
  })

  it("uses the phone-first auth client flow and invalidates the session query", async () => {
    const queryClient = createAppQueryClient()
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined as never)

    phoneNumberSignInMock.mockResolvedValue({
      data: { ok: true },
      error: null,
    } as never)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => usePhoneSignInMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        phone: "0612345678",
        password: "password123",
        rememberMe: true,
      })
    })

    expect(phoneNumberSignInMock).toHaveBeenCalledWith({
      phoneNumber: "0612345678",
      password: "password123",
      rememberMe: true,
    })
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it("rejects invalid payloads before calling auth", async () => {
    const queryClient = createAppQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => usePhoneSignInMutation(), { wrapper })

    await expect(
      result.current.mutateAsync({
        phone: "",
        password: "short",
      }),
    ).rejects.toBeTruthy()
    expect(phoneNumberSignInMock).not.toHaveBeenCalled()
  })

  it("uses the desktop bearer-token login flow inside Tauri", async () => {
    const queryClient = createAppQueryClient()
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined as never)

    vi.mocked(isDesktopRuntime).mockReturnValue(true)
    vi.mocked(signInDesktopWithPhoneNumber).mockResolvedValue({ token: "desktop-token" } as never)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => usePhoneSignInMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        phone: "0612345678",
        password: "password123",
        rememberMe: true,
      })
    })

    expect(signInDesktopWithPhoneNumber).toHaveBeenCalledWith({
      phoneNumber: "0612345678",
      password: "password123",
      rememberMe: true,
    })
    expect(phoneNumberSignInMock).not.toHaveBeenCalled()
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it("surfaces the translated Arabic message when the better-auth client fails", async () => {
    const queryClient = createAppQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    phoneNumberSignInMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid phone number or password", status: 400, statusText: "Bad Request" },
    } as never)

    const { result } = renderHook(() => usePhoneSignInMutation(), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          phone: "0612345678",
          password: "wrong-password",
          rememberMe: true,
        }),
      ).rejects.toBeTruthy()
    })

    expect(showErrorToast).toHaveBeenCalledWith("رقم الهاتف أو كلمة المرور غير صحيحة.")
    expect(showErrorToast).not.toHaveBeenCalledWith(expect.stringContaining("Invalid phone number"))
  })
})
