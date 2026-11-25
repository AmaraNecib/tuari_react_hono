// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
const calls = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), record: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: calls.error, success: calls.success, dismiss: vi.fn() } }))
vi.mock("./error-correlation", () => ({ createErrorId: () => 1, formatErrorCode: () => "TUARI-00000001", recordUiFailure: calls.record }))
import { showErrorToast, showSuccessToast, showValidationToast } from "./toast"
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe("toast correlation", () => {
  it("shows and records the same failure identifier without logging message content", () => {
    showErrorToast("Could not save")
    render(calls.error.mock.calls[0]![0])
    expect(screen.getByText("Could not save")).toBeTruthy()
    expect(screen.getByText("TUARI-00000001").getAttribute("dir")).toBe("ltr")
    expect(calls.record).toHaveBeenCalledExactlyOnceWith(1)
  })
  it("keeps correctable validation visible without generating an operational failure", () => {
    showValidationToast("Choose a source")
    render(calls.error.mock.calls[0]![0])
    expect(screen.getByText("Choose a source")).toBeTruthy()
    expect(screen.queryByText("TUARI-00000001")).toBeNull()
    expect(calls.record).not.toHaveBeenCalled()
  })
  it("does not label or log successful notifications as failures", () => {
    showSuccessToast("Saved")
    render(calls.success.mock.calls[0]![0])
    expect(screen.queryByText("TUARI-00000001")).toBeNull()
    expect(calls.record).not.toHaveBeenCalled()
  })
})
