// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
const bridge = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/toast", () => ({ showErrorToast: bridge.error }))
vi.mock("@/lib/runtime-bridge", () => ({ getRecentDiagnosticEvents: bridge.load, exportSupportBundle: bridge.save }))
vi.mock("react-i18next", () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t, i18n: { language: "ar" } }) }
})
import { DiagnosticsSettings } from "./diagnostics-settings"
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe("Diagnostics settings", () => {
  it("routes load failures through correlated notifications without showing native exception text", async () => {
    bridge.load.mockRejectedValue(new Error("secret payload"))
    render(<DiagnosticsSettings />)
    await screen.findByText("settings.diagnostics.loadError")
    expect(bridge.error).toHaveBeenCalledWith("settings.diagnostics.loadError")
    expect(screen.queryByText("secret payload")).toBeNull()
  })
  it("renders numeric event IDs as shared hex codes isolated for RTL", async () => {
    bridge.load.mockResolvedValue({ events: [{ occurredAt: "2026-01-01T12:00:00Z", level: "error", category: "ui", errorId: 9387041 }], status: { enabled: true, initialized: true, bufferedEventCount: 0, droppedEventCount: 2 } })
    render(<DiagnosticsSettings />)
    const code = await screen.findByText("TUARI-008F3C21")
    expect(code.tagName).toBe("BDI")
    expect(code.getAttribute("dir")).toBe("ltr")
    expect(screen.getByRole("region").getAttribute("dir")).toBe("rtl")
  })
  it("shows an empty state and handles save cancellation without a success claim", async () => {
    bridge.load.mockResolvedValue({ events: [], status: { enabled: false, initialized: false, bufferedEventCount: 0, droppedEventCount: 0 } })
    bridge.save.mockResolvedValue({ status: "cancelled" })
    render(<DiagnosticsSettings />)
    await screen.findByText("settings.diagnostics.empty")
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(bridge.save).toHaveBeenCalledOnce())
    expect(screen.queryByText("settings.diagnostics.saved")).toBeNull()
  })
})
