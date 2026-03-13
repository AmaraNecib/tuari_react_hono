// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/auth-client"
import { createAppQueryClient } from "@/lib/query-client"
import { usePhoneSignInMutation } from "./use-phone-sign-in-mutation"

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      phoneNumber: vi.fn(),
    },
  },
}))

describe("usePhoneSignInMutation", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.phoneNumber).mockReset()
  })

  it("uses the phone-first auth client flow and invalidates the session query", async () => {
    const queryClient = createAppQueryClient()
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined as never)

    vi.mocked(authClient.signIn.phoneNumber).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as never)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => usePhoneSignInMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        phone: "+2135550101",
        password: "password123",
        rememberMe: true,
      })
    })

    expect(authClient.signIn.phoneNumber).toHaveBeenCalledWith({
      phoneNumber: "+2135550101",
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
    expect(authClient.signIn.phoneNumber).not.toHaveBeenCalled()
  })
})
