// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { buildHomeViewCopy } from "./home-view-copy"
import { useHomeViewAuthController } from "./home-view-auth-controller"

function buildCopy() {
  return buildHomeViewCopy(((key: string) => key) as never)
}

describe("useHomeViewAuthController", () => {
  it("surfaces the translated Arabic message for a failed web sign-in", async () => {
    const copy = buildCopy()
    const { result } = renderHook(() =>
      useHomeViewAuthController({
        bootstrapMutation: { isPending: false, mutateAsync: vi.fn() } as never,
        copy,
        sessionQuery: { data: null, error: null, isPending: false, refetch: vi.fn() } as never,
        setupStatusQuery: { data: { hasUsers: true }, error: null, isPending: false, refetch: vi.fn() } as never,
        signInMutation: {
          isPending: false,
          mutateAsync: vi.fn().mockRejectedValue({
            message: "Invalid phone number or password",
            status: 400,
            statusText: "Bad Request",
          }),
        } as never,
      }),
    )

    await act(async () => {
      result.current.setPhone("0612345678")
      result.current.setPassword("password123")
    })

    await act(async () => {
      await result.current.handleSignIn({ preventDefault() {} } as never)
    })

    expect(result.current.authError).toBe("رقم الهاتف أو كلمة المرور غير صحيحة.")
  })

  it("uses the bootstrap-specific fallback error copy when setup fails without a message", async () => {
    const copy = buildCopy()
    const { result } = renderHook(() =>
      useHomeViewAuthController({
        bootstrapMutation: { isPending: false, mutateAsync: vi.fn().mockRejectedValue({}) } as never,
        copy,
        sessionQuery: { data: null, error: null, isPending: false, refetch: vi.fn() } as never,
        setupStatusQuery: { data: { hasUsers: false }, error: null, isPending: false, refetch: vi.fn() } as never,
        signInMutation: { isPending: false, mutateAsync: vi.fn() } as never,
      }),
    )

    await act(async () => {
      result.current.setName("Ahmed")
      result.current.setPhone("0612345678")
      result.current.setPassword("password123")
    })

    await act(async () => {
      await result.current.handleBootstrap({ preventDefault() {} } as never)
    })

    expect(result.current.authError).toBe("auth.bootstrapError")
  })

  it("shows a sign-in-specific error when bootstrap succeeds but follow-up sign-in fails", async () => {
    const copy = buildCopy()
    const setupRefetch = vi.fn().mockResolvedValue(undefined)
    const sessionRefetch = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useHomeViewAuthController({
        bootstrapMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) } as never,
        copy,
        sessionQuery: { data: null, error: null, isPending: false, refetch: sessionRefetch } as never,
        setupStatusQuery: {
          data: { hasUsers: false, requiresSetupKey: false },
          error: null,
          isPending: false,
          refetch: setupRefetch,
        } as never,
        signInMutation: { isPending: false, mutateAsync: vi.fn().mockRejectedValue({}) } as never,
      }),
    )

    await act(async () => {
      result.current.setName("Ahmed")
      result.current.setPhone("0612345678")
      result.current.setPassword("password123")
    })

    await act(async () => {
      await result.current.handleBootstrap({ preventDefault() {} } as never)
    })

    expect(result.current.authError).toBe("auth.bootstrapSignInError")
    expect(setupRefetch).toHaveBeenCalledTimes(1)
    expect(sessionRefetch).toHaveBeenCalledTimes(1)
    expect(result.current.name).toBe("")
    expect(result.current.setupSecret).toBe("")
    expect(result.current.password).toBe("")
    expect(result.current.phone).toBe("0612345678")
  })

  it("does not submit auth actions again while a mutation is already in flight", async () => {
    const copy = buildCopy()
    const signInMutateAsync = vi.fn()
    const bootstrapMutateAsync = vi.fn()

    const { result } = renderHook(() =>
      useHomeViewAuthController({
        bootstrapMutation: { isPending: true, mutateAsync: bootstrapMutateAsync } as never,
        copy,
        sessionQuery: { data: null, error: null, isPending: false, refetch: vi.fn() } as never,
        setupStatusQuery: { data: { hasUsers: false }, error: null, isPending: false, refetch: vi.fn() } as never,
        signInMutation: { isPending: true, mutateAsync: signInMutateAsync } as never,
      }),
    )

    await act(async () => {
      result.current.setName("Ahmed")
      result.current.setPhone("0612345678")
      result.current.setPassword("password123")
    })

    await act(async () => {
      await result.current.handleSignIn({ preventDefault() {} } as never)
      await result.current.handleBootstrap({ preventDefault() {} } as never)
    })

    expect(signInMutateAsync).not.toHaveBeenCalled()
    expect(bootstrapMutateAsync).not.toHaveBeenCalled()
  })

  it("does not force rememberMe during sign-in or bootstrap follow-up sign-in", async () => {
    const copy = buildCopy()
    const signInMutateAsync = vi.fn().mockResolvedValue(undefined)
    const bootstrapMutateAsync = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useHomeViewAuthController({
        bootstrapMutation: { isPending: false, mutateAsync: bootstrapMutateAsync } as never,
        copy,
        sessionQuery: { data: null, error: null, isPending: false, refetch: vi.fn() } as never,
        setupStatusQuery: { data: { hasUsers: true }, error: null, isPending: false, refetch: vi.fn() } as never,
        signInMutation: { isPending: false, mutateAsync: signInMutateAsync } as never,
      }),
    )

    await act(async () => {
      result.current.setPhone("0612345678")
      result.current.setPassword("password123")
    })

    await act(async () => {
      await result.current.handleSignIn({ preventDefault() {} } as never)
    })

    expect(signInMutateAsync).toHaveBeenCalledWith({
      phone: "0612345678",
      password: "password123",
    })

    signInMutateAsync.mockClear()

    const { result: bootstrapResult } = renderHook(() =>
      useHomeViewAuthController({
        bootstrapMutation: { isPending: false, mutateAsync: bootstrapMutateAsync } as never,
        copy,
        sessionQuery: { data: null, error: null, isPending: false, refetch: vi.fn() } as never,
        setupStatusQuery: {
          data: { hasUsers: false, requiresSetupKey: false },
          error: null,
          isPending: false,
          refetch: vi.fn(),
        } as never,
        signInMutation: { isPending: false, mutateAsync: signInMutateAsync } as never,
      }),
    )

    await act(async () => {
      bootstrapResult.current.setName("Ahmed")
      bootstrapResult.current.setPhone("0612345678")
      bootstrapResult.current.setPassword("password123")
    })

    await act(async () => {
      await bootstrapResult.current.handleBootstrap({ preventDefault() {} } as never)
    })

    expect(bootstrapMutateAsync).toHaveBeenCalledWith({
      name: "Ahmed",
      phone: "0612345678",
      password: "password123",
      setupSecret: undefined,
    })
    expect(signInMutateAsync).toHaveBeenCalledWith({
      phone: "0612345678",
      password: "password123",
    })
  })
})
