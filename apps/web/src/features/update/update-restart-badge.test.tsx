// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { i18n } from "@/i18n"
import { UpdateRestartBadge } from "./update-restart-badge"

// We need to mock the useRestartPending hook
const mockPending = { pending: false, setPending: vi.fn() }
vi.mock("./use-update-state", () => ({
  useRestartPending: () => mockPending,
}))

function renderBadge() {
  return render(
    <I18nextProvider i18n={i18n}>
      <UpdateRestartBadge />
    </I18nextProvider>
  )
}

describe("UpdateRestartBadge", () => {
  beforeEach(() => {
    mockPending.pending = false
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing when no restart is pending", () => {
    renderBadge()
    expect(screen.queryByTestId("update-restart-badge")).toBeNull()
  })

  it("renders the badge when restart is pending", () => {
    mockPending.pending = true
    renderBadge()
    expect(screen.getByTestId("update-restart-badge")).toBeTruthy()
  })

  it("shows a tooltip title", () => {
    mockPending.pending = true
    renderBadge()
    const badge = screen.getByTitle(/إعادة التشغيل مطلوبة لتطبيق التحديث/)
    expect(badge).toBeTruthy()
  })
})
