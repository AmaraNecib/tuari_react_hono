// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppQueryClient as createBaseQueryClient } from "@/lib/query-client"
import { sessionQueryKey } from "./workspace-keys"

function createAppQueryClient() {
  const client = createBaseQueryClient()
  client.setQueryData(sessionQueryKey, { user: { id: "account-owner", name: "Owner", phone: "0555000001", version: "test" } })
  return client
}
import { changeCurrentPassword, updateCurrentProfile } from "@/lib/auth-api"
import { useUpdateAccountSettingsMutation } from "./mock-dashboard"

vi.mock("@/lib/auth-api", () => ({
  changeCurrentPassword: vi.fn(),
  signOutDesktopSession: vi.fn(),
  updateCurrentProfile: vi.fn(),
}))

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

describe("useUpdateAccountSettingsMutation", () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, operation: () => Promise<unknown>) => operation() } })
    vi.mocked(changeCurrentPassword).mockReset()
    vi.mocked(updateCurrentProfile).mockReset()
  })

  it("revokes other sessions after a password change", async () => {
    vi.mocked(changeCurrentPassword).mockResolvedValue({ token: null } as never)

    const queryClient = createAppQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateAccountSettingsMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        currentPassword: "current-password",
        newPassword: "new-password-123",
      })
    })

    expect(changeCurrentPassword).toHaveBeenCalledWith({
      currentPassword: "current-password",
      newPassword: "new-password-123",
      revokeOtherSessions: true,
    })
    expect(changeCurrentPassword).toHaveBeenCalledTimes(1)
    expect(updateCurrentProfile).not.toHaveBeenCalled()
  })

  it("blocks a legacy Settings profile rename when any workspace retains this user's pending intent", async () => {
    const client = createAppQueryClient()
    localStorage.setItem("tuari:slice543:monthly-approval:v1:previous-workspace:account-owner", "unreadable intent must also block")
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useUpdateAccountSettingsMutation(), { wrapper })
    await expect(result.current.mutateAsync({ name: "Changed actor label" })).rejects.toThrow()
    expect(updateCurrentProfile).not.toHaveBeenCalled()
    expect(changeCurrentPassword).not.toHaveBeenCalled()
  })

  it("allows legacy Settings profile rename when only another user has pending intent", async () => {
    const client = createAppQueryClient()
    localStorage.setItem("tuari:slice543:monthly-approval:v1:previous-workspace:another-owner", "unresolved")
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useUpdateAccountSettingsMutation(), { wrapper })
    await result.current.mutateAsync({ name: "Updated Owner" })
    expect(updateCurrentProfile).toHaveBeenCalledWith({ currentPassword: undefined, name: "Updated Owner", phone: undefined })
  })

  // #321: a pre-#230 legacy user's current password can be all-invisible — the
  // mutation must pass it through EXACTLY as typed (never trimmed) so the
  // server can verify the legacy hash during recovery.
  it("passes a whitespace-only current password through untrimmed (#321 recovery)", async () => {
    vi.mocked(changeCurrentPassword).mockResolvedValue({ token: null } as never)

    const queryClient = createAppQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateAccountSettingsMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        currentPassword: "        ",
        newPassword: "new-password-123",
      })
    })

    expect(changeCurrentPassword).toHaveBeenCalledWith({
      currentPassword: "        ",
      newPassword: "new-password-123",
      revokeOtherSessions: true,
    })
    expect(changeCurrentPassword).toHaveBeenCalledTimes(1)
  })

  // #230 intact for NEW inputs: a whitespace-only new password is still
  // rejected (trimmed to empty → required), even when the current password
  // is a legacy whitespace value.
  it("still rejects a whitespace-only new password (#230)", async () => {
    const queryClient = createAppQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateAccountSettingsMutation(), { wrapper })

    await expect(
      result.current.mutateAsync({
        currentPassword: "        ",
        newPassword: "        ",
      }),
    ).rejects.toThrow()
    expect(changeCurrentPassword).not.toHaveBeenCalled()
  })
})
