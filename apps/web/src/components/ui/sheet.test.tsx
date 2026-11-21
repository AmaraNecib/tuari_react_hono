// @vitest-environment jsdom
import "@/i18n"
import { afterEach, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Sheet, SheetContent, SheetTitle } from "./sheet"

afterEach(cleanup)

function renderSheet() {
  render(<Sheet defaultOpen><SheetContent><SheetTitle>Preview drawer</SheetTitle></SheetContent></Sheet>)
  return screen.getByRole("dialog", { name: "Preview drawer" })
}

it("renders the sheet with a root-relative backdrop blur", () => {
  renderSheet()
  // Class wiring only. The real-browser probe checks computed CSS scaling.
  const overlay = document.querySelector('[data-slot="sheet-overlay"]')
  expect(overlay?.classList.contains("backdrop-blur-[calc(2rem/15)]")).toBe(true)
})

it("dismisses the open drawer with Escape", async () => {
  fireEvent.keyDown(renderSheet(), { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("dismisses the open drawer with its labelled close button", async () => {
  renderSheet()
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})
