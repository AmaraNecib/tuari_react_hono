// @vitest-environment jsdom
import "@/i18n"
import { afterEach, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogTitle } from "./dialog"

afterEach(cleanup)

it("renders the shared modal with a root-relative backdrop blur", () => {
  render(<Dialog open><DialogContent><DialogTitle>Preview</DialogTitle></DialogContent></Dialog>)
  expect(screen.getByRole("dialog", { name: "Preview" }).getAttribute("aria-modal")).toBe("true")
  // jsdom cannot compute backdrop filters. The browser probe checks actual
  // 2px and 4px rendering at 15px and 30px root sizes, respectively.
  const overlay = document.querySelector('[data-slot="dialog-overlay"]')
  expect(overlay?.classList.contains("backdrop-blur-[calc(2rem/15)]")).toBe(true)
})
