import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

// Mock @tauri-apps/plugin-dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}))

// Mock desktop-auth-session
vi.mock("@/lib/desktop-auth-session", () => ({
  isDesktopRuntime: vi.fn(),
}))

import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import {
  getCurrentVersion,
  pickUpdateFile,
  applyUpdate,
  type UpdateApplyResult,
} from "./update-commands"

const invokeMock = vi.mocked(invoke)
const openMock = vi.mocked(open)
const isDesktopRuntimeMock = vi.mocked(isDesktopRuntime)

describe("getCurrentVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when not in desktop runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(false)
    const result = await getCurrentVersion()
    expect(result).toBeNull()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("returns version string when in desktop runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    invokeMock.mockResolvedValue("0.1.0")
    const result = await getCurrentVersion()
    expect(result).toBe("0.1.0")
    expect(invokeMock).toHaveBeenCalledWith("get_current_version", undefined)
  })

  it("returns null on invoke error", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    invokeMock.mockRejectedValue(new Error("IPC error"))
    const result = await getCurrentVersion()
    expect(result).toBeNull()
  })
})

describe("pickUpdateFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when not in desktop runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(false)
    const result = await pickUpdateFile()
    expect(result).toBeNull()
    expect(openMock).not.toHaveBeenCalled()
  })

  it("returns file path when file is selected", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    openMock.mockResolvedValue("/path/to/update.update")
    const result = await pickUpdateFile()
    expect(result).toBe("/path/to/update.update")
    expect(openMock).toHaveBeenCalledWith({
      multiple: false,
      filters: [
        {
          name: "ملفات التحديث",
          extensions: ["update"],
        },
      ],
    })
  })

  it("returns null when dialog is cancelled", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    openMock.mockResolvedValue(null)
    const result = await pickUpdateFile()
    expect(result).toBeNull()
  })

  it("returns null on dialog error", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    openMock.mockRejectedValue(new Error("Dialog error"))
    const result = await pickUpdateFile()
    expect(result).toBeNull()
  })
})

describe("applyUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns failure result when not in desktop runtime", async () => {
    isDesktopRuntimeMock.mockReturnValue(false)
    const result = await applyUpdate("/test.update")
    expect(result).toEqual({
      success: false,
      message: "هذه الميزة متاحة فقط في تطبيق سطح المكتب.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("calls apply_update IPC and returns success result", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    const expectedResult: UpdateApplyResult = {
      success: true,
      message: "تم تطبيق التحديث بنجاح",
    }
    invokeMock.mockResolvedValue(expectedResult)
    const result = await applyUpdate("/path/to/update.update")
    expect(result).toEqual(expectedResult)
    expect(invokeMock).toHaveBeenCalledWith("apply_update", {
      path: "/path/to/update.update",
    })
  })

  it("calls apply_update IPC and returns error result", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    const expectedResult: UpdateApplyResult = {
      success: false,
      message: "الملف غير موجود.",
    }
    invokeMock.mockResolvedValue(expectedResult)
    const result = await applyUpdate("/path/to/missing.update")
    expect(result).toEqual(expectedResult)
  })

  it("throws when IPC call fails", async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    invokeMock.mockRejectedValue(new Error("IPC error"))
    await expect(applyUpdate("/test.update")).rejects.toThrow("IPC error")
  })
})

describe("UpdateApplyResult type", () => {
  it("supports success result shape", () => {
    const result: UpdateApplyResult = {
      success: true,
      message: "Success",
    }
    expect(result.success).toBe(true)
    expect(result.message).toBe("Success")
  })

  it("supports error result shape", () => {
    const result: UpdateApplyResult = {
      success: false,
      message: "Error message",
    }
    expect(result.success).toBe(false)
    expect(result.message).toBe("Error message")
  })
})
