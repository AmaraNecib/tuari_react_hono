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

// Mock i18n — resolve keys against the real ar resource (resource wins,
// fallback only when the key is missing), mirroring production i18next.
import { ar } from "@/i18n/resources/ar"
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      let node: unknown = ar.translation
      for (const part of key.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
          node = undefined
          break
        }
        node = (node as Record<string, unknown>)[part]
      }
      return typeof node === "string" ? node : (fallback ?? key)
    },
  }),
}))

function findButton(text: string): HTMLButtonElement | null {
  return screen.queryByRole("button", { name: text })
}

describe("UpdateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for get_current_version
    mockInvoke.mockResolvedValue("0.1.0")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders check for updates button in idle state", async () => {
    render(<UpdateSection />)

    // Wait for version to load
    expect(await screen.findByText("0.1.0")).toBeTruthy()
    expect(screen.getByText("التحقق من وجود تحديثات")).toBeTruthy()
  })

  it("shows checking state when check button is clicked", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version

    render(<UpdateSection />)

    // Wait for version to resolve
    await screen.findByText("0.1.0")

    // Set up the check_for_updates mock to hang
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}), // never resolves (for check_for_updates)
    )

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("جارٍ التحقق...")).toBeTruthy()
    // The invoke was called for get_current_version first, then check_for_updates
    expect(mockInvoke).toHaveBeenCalledWith("check_for_updates")
  })

  it("shows update available state when update is found", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "1.0.0",
      downloadUrl: "https://example.com/update",
    })

    render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("تحديث متاح:")).toBeTruthy()
    expect(screen.getByText("1.0.0")).toBeTruthy()
    expect(screen.getByText("تنزيل التحديث")).toBeTruthy()
  })

  it("shows up-to-date state when no update is available", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: false,
      latestVersion: "",
      downloadUrl: "",
    })

    render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("أنت تستخدم أحدث إصدار")).toBeTruthy()
  })

  it("shows error state when check fails", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockRejectedValueOnce(new Error("Network error"))

    render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText(/فشل التحديث/)).toBeTruthy()
    expect(screen.getByText("إعادة المحاولة")).toBeTruthy()
  })

  it("shows unavailable state in browser mode", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockRejectedValueOnce(
      new Error("__TAURI_INTERNALS__ is not available"),
    )

    render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    const button = findButton("التحقق من وجود تحديثات")
    expect(button).toBeTruthy()
    if (button) fireEvent.click(button)

    expect(await screen.findByText("لا توجد تحديثات متاحة")).toBeTruthy()
  })

  it("shows downloading progress when download starts", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
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

    expect(await screen.findByText("0.1.0")).toBeTruthy()

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
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
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

    expect(await screen.findByText("0.1.0")).toBeTruthy()

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
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockRejectedValueOnce(new Error("Network error"))

    render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

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

  it("ignores concurrent double-clicks on the Download button", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "2.0.0",
      downloadUrl: "https://example.com/update",
    })
    mockListen.mockResolvedValue(mockUnlisten)
    // start_update_download hangs so we can observe the download state
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}),
    )

    render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    // Get to available state
    const checkButton = findButton("التحقق من وجود تحديثات")
    expect(checkButton).toBeTruthy()
    if (checkButton) fireEvent.click(checkButton)
    expect(await screen.findByText("تنزيل التحديث")).toBeTruthy()

    // Capture call count before clicking
    const callsBeforeDownload = mockInvoke.mock.calls.length

    // Two synchronous clicks on Download
    const downloadButton = findButton("تنزيل التحديث")
    expect(downloadButton).toBeTruthy()
    if (downloadButton) {
      fireEvent.click(downloadButton)
      fireEvent.click(downloadButton)
    }

    // Wait for the downloading state to render
    expect(await screen.findByText("0.0%")).toBeTruthy()

    // Only ONE additional invoke call should have been made for start_update_download,
    // not two. start_update_download is the third invoke call total
    // (get_current_version, check_for_updates, start_update_download).
    const callsAfterDownload = mockInvoke.mock.calls.length
    expect(callsAfterDownload - callsBeforeDownload).toBe(1)
  })

  it("releases listener if component unmounts while download is in flight", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "2.0.0",
      downloadUrl: "https://example.com/update",
    })
    mockListen.mockResolvedValue(mockUnlisten)
    // start_update_download hangs so the listener is registered and never auto-cleaned
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}),
    )

    const { unmount } = render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    // Navigate to available state
    const checkButton = findButton("التحقق من وجود تحديثات")
    expect(checkButton).toBeTruthy()
    if (checkButton) fireEvent.click(checkButton)
    expect(await screen.findByText("تنزيل التحديث")).toBeTruthy()

    // Start download — this registers the listener via mockListen
    const downloadButton = findButton("تنزيل التحديث")
    expect(downloadButton).toBeTruthy()
    if (downloadButton) fireEvent.click(downloadButton)

    // Wait for the downloading state to render (listener is now registered)
    expect(await screen.findByText("0.0%")).toBeTruthy()
    // Allow the await listen() microtask to complete and the ref to be assigned
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Reset the mock to count fresh calls
    mockUnlisten.mockClear()

    // Unmount while download is in flight — the cleanup useEffect must call unlisten
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockUnlisten).toHaveBeenCalled()
  })

  it("cleans up event listener on unmount", async () => {
    mockInvoke.mockResolvedValueOnce("0.1.0") // get_current_version
    mockInvoke.mockResolvedValueOnce({
      updateAvailable: true,
      latestVersion: "2.0.0",
      downloadUrl: "https://example.com/update",
    })
    mockListen.mockResolvedValue(mockUnlisten)
    mockInvoke.mockImplementationOnce(
      () => new Promise(() => {}),
    )

    const { unmount } = render(<UpdateSection />)

    expect(await screen.findByText("0.1.0")).toBeTruthy()

    // Trigger download
    const checkButton = findButton("التحقق من وجود تحديثات")
    expect(checkButton).toBeTruthy()
    if (checkButton) fireEvent.click(checkButton)
    expect(await screen.findByText("تنزيل التحديث")).toBeTruthy()

    const downloadButton = findButton("تنزيل التحديث")
    expect(downloadButton).toBeTruthy()
    if (downloadButton) fireEvent.click(downloadButton)

    expect(await screen.findByText("0.0%")).toBeTruthy()

    // Unmount should call unlisten
    unmount()

    expect(mockUnlisten).toHaveBeenCalled()
  })
})
