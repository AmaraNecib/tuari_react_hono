// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TableHead } from "./table"
import { ResponsiveTableCell, ResponsiveTableHead } from "./responsive-table"

beforeEach(() => vi.stubGlobal("innerWidth", 1280))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(["standard", "responsive"])("renders %s headings with root-relative font sizing", (variant) => {
  render(<table><thead><tr>{variant === "standard"
    ? <TableHead>Location</TableHead>
    : <ResponsiveTableHead>Location</ResponsiveTableHead>}
  </tr></thead></table>)
  const heading = screen.getByRole("columnheader", { name: "Location" })
  expect(heading.getAttribute("scope")).toBe("col")
  // Wiring guard only. Real-browser evidence checks actual 12px/24px sizes.
  expect(heading.classList.contains("text-[0.8rem]")).toBe(true)
})

it("preserves native standard header props and caller font overrides", () => {
  render(<table><thead><tr><TableHead colSpan={2} className="text-lg">Location</TableHead></tr></thead></table>)
  const heading = screen.getByRole("columnheader", { name: "Location" })
  expect(heading.getAttribute("colspan")).toBe("2")
  expect(heading.classList.contains("text-lg")).toBe(true)
  expect(heading.classList.contains("text-[0.8rem]")).toBe(false)
})

it("preserves responsive labels and header visibility through real viewport resizes", () => {
  render(<table><thead><tr><ResponsiveTableHead>Location</ResponsiveTableHead></tr></thead>
    <tbody><tr><ResponsiveTableCell mobileLabel="Location">North store</ResponsiveTableCell></tr></tbody></table>)
  const cell = screen.getByRole("cell", { name: "North store" })
  expect(screen.getByRole("columnheader", { name: "Location" })).toBeTruthy()
  expect(cell.getAttribute("data-label")).toBeNull()
  vi.stubGlobal("innerWidth", 390)
  fireEvent(window, new Event("resize"))
  expect(screen.queryByRole("columnheader")).toBeNull()
  expect(cell.getAttribute("data-label")).toBe("Location")
  expect(cell.textContent).toBe("North store")
  vi.stubGlobal("innerWidth", 1280)
  fireEvent(window, new Event("resize"))
  expect(screen.getByRole("columnheader", { name: "Location" })).toBeTruthy()
  expect(cell.getAttribute("data-label")).toBeNull()
})
