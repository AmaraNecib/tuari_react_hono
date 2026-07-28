// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { i18n } from "@/i18n"
import { UpdateRestartModal } from "./update-restart-modal"

const onRestartNowMock = vi.fn()
const onLaterMock = vi.fn()

function renderModal(open = true) {
  return render(
    <I18nextProvider i18n={i18n}>
      <UpdateRestartModal
        open={open}
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
    expect(onRestartNowMock).toHaveBeenCalledTimes(1)
  })

  it("calls onLater when 'Later' is clicked", () => {
    renderModal(true)
    fireEvent.click(screen.getByTestId("update-later-btn"))
    expect(onLaterMock).toHaveBeenCalledTimes(1)
  })

  it("does not call onLater when 'Restart Now' is clicked (regression for spurious onLater)", () => {
    renderModal(true)
    fireEvent.click(screen.getByTestId("update-restart-now-btn"))
    expect(onRestartNowMock).toHaveBeenCalledTimes(1)
    // Critical: clicking "Restart Now" must not also trigger onLater,
    // otherwise the controller would re-set restartPending=true after
    // the "Restart Now" path already cleared it.
    expect(onLaterMock).not.toHaveBeenCalled()
  })
})
