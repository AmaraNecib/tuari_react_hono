// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { checkForUpdates, applyUpdate, restartApp } from "./update-bridge"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

const invokeMock = vi.mocked(invoke)

describe("update-bridge", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("checkForUpdates", () => {
    it("returns update check result on success", async () => {
      const expected = {
        updateAvailable: true,
        latestVersion: "1.1.0",
        downloadUrl: "https://example.com/update.zip",
      }
      invokeMock.mockResolvedValue(expected)

      const result = await checkForUpdates()
      expect(result).toEqual(expected)
      expect(invokeMock).toHaveBeenCalledWith("check_for_updates")
    })

    it("returns null when Tauri bridge is unavailable", async () => {
      invokeMock.mockRejectedValue(new Error("Tauri IPC not available"))

      const result = await checkForUpdates()
      expect(result).toBeNull()
    })
  })

  describe("applyUpdate", () => {
    it("returns apply result on success", async () => {
      const expected = { success: true, message: "update applied" }
      invokeMock.mockResolvedValue(expected)

      const result = await applyUpdate("/tmp/update.zip")
      expect(result).toEqual(expected)
      expect(invokeMock).toHaveBeenCalledWith("apply_update", {
        path: "/tmp/update.zip",
      })
    })

    it("returns null when Tauri bridge is unavailable", async () => {
      invokeMock.mockRejectedValue(new Error("bridge offline"))

      const result = await applyUpdate("/tmp/test.zip")
      expect(result).toBeNull()
    })
  })

  describe("restartApp", () => {
    it("calls restart_app IPC command", async () => {
      invokeMock.mockResolvedValue(undefined)

      await restartApp()
      expect(invokeMock).toHaveBeenCalledWith("restart_app")
    })

    it("handles Tauri bridge unavailability gracefully", async () => {
      invokeMock.mockRejectedValue(new Error("bridge offline"))

      // Should not throw
      await expect(restartApp()).resolves.toBeUndefined()
    })
  })
})
