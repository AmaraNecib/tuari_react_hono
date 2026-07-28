// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { restartApp } from "./update-bridge"

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

  describe("restartApp", () => {
    it("calls restart_app IPC command", async () => {
      invokeMock.mockResolvedValue(undefined)

      await restartApp()
      expect(invokeMock).toHaveBeenCalledWith("restart_app")
    })

    it("handles Tauri bridge unavailability gracefully", async () => {
      invokeMock.mockRejectedValue(new Error("__TAURI_INTERNALS__ is not available"))

      // Should not throw
      await expect(restartApp()).resolves.toBeUndefined()
    })

    it("rethrows unexpected errors in desktop mode", async () => {
      invokeMock.mockRejectedValue(new Error("command not found: restart_app"))

      await expect(restartApp()).rejects.toThrow(/Failed to restart/)
    })
  })
})
