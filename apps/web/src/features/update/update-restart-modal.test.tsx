// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { i18n } from "@/i18n"
import { UpdateRestartModal } from "./update-restart-modal"
import * as bridge from "./update-bridge"

// Mock the Tauri bridge
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

const setPendingMock = vi.fn()
const onOpenChangeMock = vi.fn()

function renderModal(open = true) {
  return render(
    <I18nextProvider i18n={i18n}>
      <UpdateRestartModal
        open={open}
        onOpenChange={onOpenChangeMock}
        setPending={setPendingMock}
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
    expect(screen.getByText(/إعادة التشغيل مطلوبة/)).toBeTruthy()
    expect(screen.getByText(/تم تطبيق التحديث/)).toBeTruthy()
  })

  it("does not render when closed", () => {
    renderModal(false)
    expect(screen.queryByText(/تم تطبيق التحديث/)).toBeNull()
  })

  it("calls restartApp and clears pending on 'Restart Now'", async () => {
    const restartAppSpy = vi.spyOn(bridge, "restartApp")
    restartAppSpy.mockResolvedValue(undefined)

    renderModal(true)
    const restartButton = screen.getByText(/إعادة التشغيل الآن/)
    fireEvent.click(restartButton)

    expect(setPendingMock).toHaveBeenCalledWith(false)
    expect(restartAppSpy).toHaveBeenCalled()
  })

  it("sets pending and dismisses on 'Later'", () => {
    renderModal(true)
    const laterButton = screen.getByText(/لاحقاً/)
    fireEvent.click(laterButton)

    expect(setPendingMock).toHaveBeenCalledWith(true)
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
  })
})
