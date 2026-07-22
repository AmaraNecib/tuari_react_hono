// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useRestartPending } from "./use-update-state"

describe("useRestartPending", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("starts with pending=false", () => {
    const { result } = renderHook(() => useRestartPending())
    expect(result.current.pending).toBe(false)
  })

  it("sets pending=true and reads it back", () => {
    const { result } = renderHook(() => useRestartPending())
    act(() => {
      result.current.setPending(true)
    })
    expect(result.current.pending).toBe(true)
  })

  it("persists to localStorage", () => {
    const { result: hook1 } = renderHook(() => useRestartPending())
    act(() => {
      hook1.current.setPending(true)
    })
    expect(localStorage.getItem("tuari:restart-pending")).toBe("true")
  })

  it("reads persisted value from localStorage on mount", () => {
    localStorage.setItem("tuari:restart-pending", "true")
    const { result } = renderHook(() => useRestartPending())
    expect(result.current.pending).toBe(true)
  })

  it("clears localStorage when setPending(false)", () => {
    localStorage.setItem("tuari:restart-pending", "true")
    const { result } = renderHook(() => useRestartPending())
    act(() => {
      result.current.setPending(false)
    })
    expect(result.current.pending).toBe(false)
    expect(localStorage.getItem("tuari:restart-pending")).toBeNull()
  })

  it("handles localStorage errors gracefully", () => {
    // Mock localStorage.getItem to throw
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error("localStorage unavailable")
    })

    const { result } = renderHook(() => useRestartPending())
    expect(result.current.pending).toBe(false)

    Storage.prototype.getItem = originalGetItem
  })
})
