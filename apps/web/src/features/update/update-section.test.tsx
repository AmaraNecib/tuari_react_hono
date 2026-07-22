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
