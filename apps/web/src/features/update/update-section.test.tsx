// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import { UpdateSection } from "./update-section"

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))
const mockInvoke = vi.mocked(invoke)

// Mock Tauri event listen
const mockUnlisten = vi.fn()
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}))
const mockListen = vi.mocked(listen)

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

function findButton(text: string): HTMLButtonElement | null {
  return screen.queryByRole("button", { name: text })
}

describe("UpdateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders check for updates button in idle state", () => {
    render(<UpdateSection />)

    expect(screen.getByText("التحقق من وجود تحديثات")).toBeTruthy()
    expect(screen.getByText("0.1.0")).toBeTruthy()
  })

  it("shows checking state when check button is clicked", async () => {
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    )

    render(<UpdateSection />)

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("جارٍ التحقق...")).toBeTruthy()
    expect(mockInvoke).toHaveBeenCalledWith("check_for_updates")
  })

  it("shows update available state when update is found", async () => {
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "1.0.0",
      downloadUrl: "https://example.com/update",
    })

    render(<UpdateSection />)

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("تحديث متاح:")).toBeTruthy()
    expect(screen.getByText("1.0.0")).toBeTruthy()
    expect(screen.getByText("تنزيل التحديث")).toBeTruthy()
  })

  it("shows up-to-date state when no update is available", async () => {
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: false,
      latestVersion: "",
      downloadUrl: "",
    })

    render(<UpdateSection />)

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("أنت تستخدم أحدث إصدار")).toBeTruthy()
  })

  it("shows error state when check fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Network error"))

    render(<UpdateSection />)

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    // The error text is "فشل التحديث: Network error"
    expect(await screen.findByText(/فشل التحديث/)).toBeTruthy()
    expect(screen.getByText("إعادة المحاولة")).toBeTruthy()
  })

  it("shows unavailable state in browser mode", async () => {
    mockInvoke.mockRejectedValueOnce(
      new Error("__TAURI_INTERNALS__ is not available"),
    )

    render(<UpdateSection />)

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("لا توجد تحديثات متاحة")).toBeTruthy()
  })

  it("shows downloading progress when download starts", async () => {
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "2.0.0",
      downloadUrl: "https://example.com/update",
    })
    mockListen.mockResolvedValue(mockUnlisten)
    // stop download from completing
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}),
    )

    render(<UpdateSection />)

    // Check for updates
    const checkButton = findButton("التحقق من وجود تحديثات")
    expect(checkButton).toBeTruthy()
    if (checkButton) fireEvent.click(checkButton)

    expect(await screen.findByText("تنزيل التحديث")).toBeTruthy()

    // Start download
    const downloadButton = findButton("تنزيل التحديث")
    expect(downloadButton).toBeTruthy()
    if (downloadButton) fireEvent.click(downloadButton)

    // Should now be in downloading state
    expect(await screen.findByText("0.0%")).toBeTruthy()
    expect(screen.getByText("إلغاء")).toBeTruthy()
  })

  it("cancels download when cancel button is clicked", async () => {
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "2.0.0",
      downloadUrl: "https://example.com/update",
    })
    mockListen.mockResolvedValue(mockUnlisten)
    // start_update_download hangs
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}),
    )

    render(<UpdateSection />)

    // Check for updates
    const checkButton = findButton("التحقق من وجود تحديثات")
    expect(checkButton).toBeTruthy()
    if (checkButton) fireEvent.click(checkButton)
    expect(await screen.findByText("تنزيل التحديث")).toBeTruthy()

    // Start download
    const downloadButton = findButton("تنزيل التحديث")
    expect(downloadButton).toBeTruthy()
    if (downloadButton) fireEvent.click(downloadButton)

    // Wait for downloading state
    expect(await screen.findByText("0.0%")).toBeTruthy()

    // Click cancel
    mockInvoke.mockResolvedValueOnce(undefined)
    const cancelButton = findButton("إلغاء")
    expect(cancelButton).toBeTruthy()
    if (cancelButton) fireEvent.click(cancelButton)

    expect(mockInvoke).toHaveBeenCalledWith("cancel_update_download")
  })

  it("returns to idle from error state via retry", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Network error"))

    render(<UpdateSection />)

    // Check for updates -> error
    const checkButton = findButton("التحقق من وجود تحديثات")
    expect(checkButton).toBeTruthy()
    if (checkButton) fireEvent.click(checkButton)
    expect(await screen.findByText(/فشل التحديث/)).toBeTruthy()

    // Click retry
    const retryButton = findButton("إعادة المحاولة")
    expect(retryButton).toBeTruthy()
    if (retryButton) fireEvent.click(retryButton)

    // Back to idle
    expect(screen.getByText("التحقق من وجود تحديثات")).toBeTruthy()
  })
})
