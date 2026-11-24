// @vitest-environment jsdom
import "@/i18n"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useLicenseActivation } from "./use-license-activation"
import { useLicenseStatus } from "./use-license-status"
const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke, isTauri: () => true }))
afterEach(() => { cleanup(); vi.clearAllMocks(); delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ })
function rejectOperations() {
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "record_ui_failure") return
    throw new Error("private-license-key-and-host-path")
  })
}
function records() { return native.invoke.mock.calls.filter(([command]) => command === "record_ui_failure") }
describe("license operational feedback ownership", () => {
  it("treats an unsuccessful activation envelope as a safe failed attempt", async () => {
    native.invoke.mockImplementation(async (command: string) => command === "activate_license" ? { success: false, message: "private-detail" } : undefined)
    const { result } = renderHook(() => useLicenseActivation())
    await act(async () => { await expect(result.current.activateLicense("key")).rejects.toThrow(/TUARI-/) })
    expect(result.current.result).toBeNull()
    expect(result.current.error).not.toContain("private-detail")
    expect(records()).toHaveLength(1)
  })

  it("sanitizes activation failures, records once per attempt and not on rerender", async () => {
    rejectOperations()
    const { result, rerender } = renderHook(() => useLicenseActivation())
    await act(async () => { await expect(result.current.activateLicense("key")).rejects.toThrow(/TUARI-[0-9A-F]{8}/) })
    const first = result.current.error
    expect(first).not.toContain("private-license")
    await waitFor(() => expect(records()).toHaveLength(1))
    rerender()
    expect(records()).toHaveLength(1)
    await act(async () => { await expect(result.current.activateLicense("key")).rejects.toThrow(/TUARI-/) })
    expect(result.current.error).not.toBe(first)
    expect(records()).toHaveLength(2)
    expect(records()[0]?.[1]).toEqual({ id: expect.any(Number) })
  })
  it("sanitizes status failures with a fresh correlation only on refresh", async () => {
    rejectOperations()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const { result, rerender } = renderHook(() => useLicenseStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/TUARI-[0-9A-F]{8}/)
    expect(result.current.error).not.toContain("private-license")
    const first = result.current.error
    expect(records()).toHaveLength(1)
    rerender()
    expect(records()).toHaveLength(1)
    await act(async () => { await result.current.refresh() })
    expect(result.current.error).not.toBe(first)
    expect(records()).toHaveLength(2)
  })
  it("does not treat browser unavailability as a failed status operation", async () => {
    const { result } = renderHook(() => useLicenseStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(native.invoke).not.toHaveBeenCalled()
  })
})
