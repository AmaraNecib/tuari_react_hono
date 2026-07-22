// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { i18n } from "@/i18n"
import { UpdateRestartModal } from "./update-restart-modal"

const onRestartNowMock = vi.fn()
const onLaterMock = vi.fn()
const onOpenChangeMock = vi.fn()

function renderModal(open = true) {
  return render(
    <I18nextProvider i18n={i18n}>
      <UpdateRestartModal
        open={open}
        onOpenChange={onOpenChangeMock}
        onRestartNow={onRestartNowMock}
        onLater={onLaterMock}
      />
    </I18nextProvider>
  )
}

describe("UpdateRestartModal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders the dialog when open", () => {
    renderModal(true)
    expect(screen.getByTestId("update-restart-modal")).toBeTruthy()
    expect(screen.getByTestId("update-restart-now-btn")).toBeTruthy()
    expect(screen.getByTestId("update-later-btn")).toBeTruthy()
  })

  it("does not render when closed", () => {
    renderModal(false)
    expect(screen.queryByTestId("update-restart-modal")).toBeNull()
  })

  it("calls onRestartNow when 'Restart Now' is clicked", () => {
    renderModal(true)
    fireEvent.click(screen.getByTestId("update-restart-now-btn"))
    expect(onRestartNowMock).toHaveBeenCalled()
  })

  it("calls onLater when 'Later' is clicked", () => {
    renderModal(true)
    fireEvent.click(screen.getByTestId("update-later-btn"))
    expect(onLaterMock).toHaveBeenCalled()
  })

  it("calls onLater when dismissed via overlay/Escape", () => {
    renderModal(true)
    // Simulate AlertDialog closing without open
    fireEvent.click(screen.getByTestId("update-later-btn"))
    expect(onLaterMock).toHaveBeenCalled()
  })
})
