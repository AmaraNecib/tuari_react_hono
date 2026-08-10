// @vitest-environment jsdom
import "@/i18n"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-provider"

afterEach(() => cleanup())

describe("KeyboardShortcutsHelp", () => {
  it("renders a labelled modal dialog when open", () => {
    render(<KeyboardShortcutsHelp isOpen onClose={vi.fn()} />)

    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    // DialogTitle wires aria-labelledby automatically.
    expect(screen.getByRole("heading", { name: "اختصارات لوحة المفاتيح" })).toBeTruthy()
    expect(screen.getByText("عام")).toBeTruthy()
    expect(screen.getByText("التنقل")).toBeTruthy()
  })

  it("does not render when closed", () => {
    render(<KeyboardShortcutsHelp isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes on Escape", () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsHelp isOpen onClose={onClose} />)

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closes via the close button", () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsHelp isOpen onClose={onClose} />)

    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
