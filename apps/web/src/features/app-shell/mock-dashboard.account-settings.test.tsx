// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAppQueryClient } from "@/lib/query-client"
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
  beforeEach(() => {
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
