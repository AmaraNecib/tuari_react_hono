import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

// Desktop IPC + runtime detection + RPC client are all mocked so the
// orchestration sequence (rotate → RPC → restore-on-failure) can be pinned
// without a Tauri runtime or a live API.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@/lib/desktop-auth-session", () => ({
  isDesktopRuntime: vi.fn(),
}))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { changeDbEncryptionKey: vi.fn() },
}))

import { invoke } from "@tauri-apps/api/core"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { rpcClient } from "@/lib/orpc-client"
import { useChangeDbEncryptionKeyMutation } from "./recovery-key-hooks"

const invokeMock = vi.mocked(invoke)
const isDesktopRuntimeMock = vi.mocked(isDesktopRuntime)
const changeDbEncryptionKeyMock = vi.mocked(rpcClient.changeDbEncryptionKey)

function renderMutation() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useChangeDbEncryptionKeyMutation(), { wrapper })
}

const INPUT = { currentKey: "old-key", newKey: "new-key-123" }

beforeEach(() => {
  vi.clearAllMocks()
  isDesktopRuntimeMock.mockReturnValue(false)
})

describe("useChangeDbEncryptionKeyMutation", () => {
  it("calls the RPC directly (no rotation) outside the desktop runtime", async () => {
    changeDbEncryptionKeyMock.mockResolvedValue({ success: true })
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({ success: true })

    expect(changeDbEncryptionKeyMock).toHaveBeenCalledWith(INPUT)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rotates the persisted key BEFORE the rekey RPC on the desktop runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockResolvedValue({ success: true })
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({ success: true })

    // Rotation happens first, then the rekey RPC, and no rollback on success.
    expect(invokeMock).toHaveBeenNthCalledWith(1, "rotate_db_key", { newKey: INPUT.newKey })
    expect(changeDbEncryptionKeyMock).toHaveBeenCalledWith(INPUT)
    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
  })

  it("rolls the rotation back when the RPC returns a failure result", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockResolvedValue({
      success: false,
      error: "Current encryption key is invalid",
    })
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      success: false,
      error: "Current encryption key is invalid",
    })

    expect(invokeMock).toHaveBeenCalledWith("rotate_db_key", { newKey: INPUT.newKey })
    expect(invokeMock).toHaveBeenCalledWith("restore_db_key")
  })

  it("rolls the rotation back when the RPC throws, and rethrows the error", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockRejectedValue(new Error("network down"))
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("network down")

    expect(invokeMock).toHaveBeenCalledWith("restore_db_key")
  })

  it("does not call the RPC (or roll back) when the rotation itself fails", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    invokeMock.mockRejectedValueOnce(new Error("keyring unavailable"))
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("keyring unavailable")

    expect(changeDbEncryptionKeyMock).not.toHaveBeenCalled()
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it("swallows a rollback failure so the original RPC error still surfaces", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockRejectedValue(new Error("rekey failed"))
    invokeMock.mockRejectedValueOnce(undefined) // rotate OK
    invokeMock.mockRejectedValueOnce(new Error("keyring busy")) // restore fails — swallowed
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("rekey failed")
  })
})
