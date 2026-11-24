import { describe, expect, it, vi, afterEach } from "vitest"
import { formatErrorCode, resolveErrorId, recordUiFailure } from "./error-correlation"

vi.mock("./desktop-auth-session", () => ({ isDesktopRuntime: () => true }))
const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock("@tauri-apps/api/core", () => ({ invoke }))
afterEach(() => vi.clearAllMocks())

describe("local UI failure correlation", () => {
  it("uses a stable eight-digit hex representation and prefix-agnostic numeric lookup", () => {
    expect(formatErrorCode(0x8f3c21)).toBe("TUARI-008F3C21")
    expect(resolveErrorId("OTHER-008f3c21")).toBe(9387041)
    expect(resolveErrorId("TUARI-00000000")).toBe(0)
    for (const invalid of ["TUARI-FF", "TUARI-123456789", "TUARI-XXXXXXXX", "-12345678"]) {
      expect(resolveErrorId(invalid)).toBeNull()
    }
    expect(() => formatErrorCode(-1)).toThrow()
    expect(() => formatErrorCode(4294967296)).toThrow()
  })
  it("records only the numeric identifier, never UI messages or secrets", async () => {
    await recordUiFailure(0x8f3c21)
    expect(invoke).toHaveBeenCalledWith("record_ui_failure", { id: 9387041 })
  })
  it("does not turn logging failure into an unhandled rejection", async () => {
    invoke.mockRejectedValueOnce(new Error("disk unavailable"))
    await expect(recordUiFailure(1)).resolves.toBeUndefined()
  })
})
