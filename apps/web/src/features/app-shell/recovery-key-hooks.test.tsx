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
import {
  DESKTOP_BRIDGE_ERROR_KIND,
  DESKTOP_BRIDGE_FAILURE_PHASE,
} from "@/lib/desktop-api-bridge"
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

type DesktopBridgeFailurePhase =
  (typeof DESKTOP_BRIDGE_FAILURE_PHASE)[keyof typeof DESKTOP_BRIDGE_FAILURE_PHASE]

function desktopBridgeError(message: string, phase: DesktopBridgeFailurePhase) {
  return Object.assign(new Error(message), {
    desktopBridge: { kind: DESKTOP_BRIDGE_ERROR_KIND, phase },
  })
}

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

    // Rotation happens first, then the rekey RPC. On a confirmed rekey the
    // rotation is acknowledged as final (no restore — the new key is right).
    expect(invokeMock).toHaveBeenNthCalledWith(1, "rotate_db_key", { newKey: INPUT.newKey })
    expect(changeDbEncryptionKeyMock).toHaveBeenCalledWith(INPUT)
    expect(invokeMock).toHaveBeenLastCalledWith("complete_db_key_rotation")
    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
  })

  it("rolls the rotation back when the RPC returns a failure result", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockResolvedValue({
      success: false,
      error: "Current encryption key is invalid",
      rekeyed: false,
    })
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      success: false,
      error: "Current encryption key is invalid",
      rekeyed: false,
    })

    expect(invokeMock).toHaveBeenCalledWith("rotate_db_key", { newKey: INPUT.newKey })
    expect(invokeMock).toHaveBeenCalledWith("restore_db_key")
  })

  it("keeps the new key (does NOT restore) when the rekey succeeded but persistence failed", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockResolvedValue({
      success: false,
      error: "Failed to persist database encryption key",
      rekeyed: true,
    })
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      success: false,
      error: "Failed to persist database encryption key",
      rekeyed: true,
    })

    // The DB IS on the new key — restoring the old key would orphan it.
    expect(invokeMock).toHaveBeenCalledWith("complete_db_key_rotation")
    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
  })

  it("keeps the new key AND the rollback slot (no restore, no complete) when the rekey is AMBIGUOUS", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockResolvedValue({
      success: false,
      error: "Database re-encryption could not be verified",
      rekeyed: false,
      ambiguous: true,
    })
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      success: false,
      error: "Database re-encryption could not be verified",
      rekeyed: false,
      ambiguous: true,
    })

    // AMBIGUOUS (Greptile P1): the rekey ran server-side but its verification
    // could not complete — the DB is LIKELY on the new key. Restoring the old
    // key would orphan it on the next startup; clearing the rollback slot
    // would lose the only way back. The hook must do NEITHER and surface the
    // honest "rekey applied but verification pending" state via the result.
    expect(invokeMock).toHaveBeenCalledWith("rotate_db_key", { newKey: INPUT.newKey })
    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("restores the old key when the RPC fails before delivery (transport/bridge error)", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    // The bridge explicitly marks a connection failure as pre-delivery. The
    // database was DEFINITELY not rekeyed.
    changeDbEncryptionKeyMock.mockRejectedValue(
      desktopBridgeError("network down", DESKTOP_BRIDGE_FAILURE_PHASE.PRE_DELIVERY),
    )
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("network down")

    // A pre-delivery failure must roll the rotation back: completing it
    // would drop the only old-key rollback slot while the database still
    // requires the old key, breaking the next startup (review finding).
    expect(invokeMock).toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("keeps the new key and rollback slot when the bridge fails reading a response body after delivery", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    // The Rust bridge received response headers before the body read failed.
    // There is no ORPC metadata, but the API handler may already have
    // rekeyed the database, so this outcome is unknown.
    changeDbEncryptionKeyMock.mockRejectedValue(
      desktopBridgeError(
        "Failed to read desktop API bridge response body",
        DESKTOP_BRIDGE_FAILURE_PHASE.RESPONSE_BODY_READ,
      ),
    )
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow(
      "Failed to read desktop API bridge response body",
    )

    // Keep the new key AND the rollback slot: neither restore nor complete is
    // safe when the response was delivered but could not be consumed.
    expect(invokeMock).toHaveBeenCalledWith("rotate_db_key", { newKey: INPUT.newKey })
    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("keeps the new key and rollback slot for an unclassified RPC failure", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    // Missing both ORPC metadata and the bridge phase is not proof of
    // pre-delivery. Fail closed: the outcome stays pending.
    changeDbEncryptionKeyMock.mockRejectedValue(new Error("unclassified failure"))
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("unclassified failure")

    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("keeps the new key and rollback slot when the bridge failure phase is unknown", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    // A non-connect send failure is not proof of pre-delivery: the request
    // may have been delivered before the connection died. Fail closed.
    changeDbEncryptionKeyMock.mockRejectedValue(
      desktopBridgeError("bridge request failed", DESKTOP_BRIDGE_FAILURE_PHASE.UNKNOWN),
    )
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("bridge request failed")

    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("restores the old key when the server rejects the RPC with a client error (4xx — handler never ran)", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    // ORPC server errors carry a string code + numeric status. A 401 means
    // the auth middleware rejected the request BEFORE the rekey handler ran
    // — the database was definitely not re-encrypted.
    changeDbEncryptionKeyMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { code: "UNAUTHORIZED", status: 401 }),
    )
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("Unauthorized")

    expect(invokeMock).toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("keeps the new key AND the rollback slot when the RPC throws a 5xx server error (outcome unknown)", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    // A 500 means the server RESPONDED — the rekey handler may have run
    // before the failure, so the outcome is unknown. Neither restore (would
    // orphan a rekeyed DB) nor complete (would drop the only way back if the
    // rekey did NOT happen) — the rollback slot stays for a same-session
    // retry/re-verification.
    changeDbEncryptionKeyMock.mockRejectedValue(
      Object.assign(new Error("Internal Server Error"), {
        code: "INTERNAL_SERVER_ERROR",
        status: 500,
      }),
    )
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("Internal Server Error")

    expect(invokeMock).toHaveBeenCalledWith("rotate_db_key", { newKey: INPUT.newKey })
    expect(invokeMock).not.toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })

  it("does not call the RPC (or roll back) when the rotation itself fails", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    invokeMock.mockRejectedValueOnce(new Error("keyring unavailable"))
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("keyring unavailable")

    expect(changeDbEncryptionKeyMock).not.toHaveBeenCalled()
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it("swallows a failing restore so the original pre-delivery RPC error still surfaces", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockRejectedValue(
      desktopBridgeError("rekey failed", DESKTOP_BRIDGE_FAILURE_PHASE.PRE_DELIVERY),
    )
    invokeMock.mockResolvedValueOnce(undefined) // rotate OK
    invokeMock.mockRejectedValueOnce(new Error("keyring busy")) // restore fails — swallowed
    const { result } = renderMutation()

    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow("rekey failed")
  })

  it("swallows a failing restore so the original RPC failure still surfaces", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    changeDbEncryptionKeyMock.mockResolvedValue({
      success: false,
      error: "Current encryption key is invalid",
      rekeyed: false,
    })
    invokeMock.mockResolvedValueOnce(undefined) // rotate OK
    invokeMock.mockRejectedValueOnce(new Error("keyring busy")) // restore fails — swallowed
    const { result } = renderMutation()

    // The definitive-failure result is still returned to the caller — a
    // failing rollback must not mask it (the keyring may stay on the new key,
    // which the user must be told about via the surfaced error).
    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      success: false,
      error: "Current encryption key is invalid",
      rekeyed: false,
    })

    expect(invokeMock).toHaveBeenCalledWith("restore_db_key")
    expect(invokeMock).not.toHaveBeenCalledWith("complete_db_key_rotation")
  })
})
