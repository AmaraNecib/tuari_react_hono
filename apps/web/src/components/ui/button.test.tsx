// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Button } from "./button"

afterEach(cleanup)

it.each([
  ["xs", "rounded-[min(var(--radius-md),calc(2rem/3))]"],
  ["sm", "rounded-[min(var(--radius-md),0.8rem)]"],
  ["icon-xs", "rounded-[min(var(--radius-md),calc(2rem/3))]"],
  ["icon-sm", "rounded-[min(var(--radius-md),0.8rem)]"],
] as const)("wires the %s compact size to a root-relative corner cap", (size, radius) => {
  render(<Button size={size} aria-label="Preview" />)
  // Wiring only. The browser probe activates the min cap and checks computed CSS.
  expect(screen.getByRole("button", { name: "Preview" }).classList.contains(radius)).toBe(true)
})

it("preserves caller corner overrides", () => {
  render(<Button size="xs" className="rounded-full">Preview</Button>)
  const button = screen.getByRole("button", { name: "Preview" })
  expect(button.classList.contains("rounded-full")).toBe(true)
  expect(button.classList.contains("rounded-[min(var(--radius-md),calc(2rem/3))]")).toBe(false)
})

it("keeps an enabled native button clickable and a disabled button inactive", () => {
  const onClick = vi.fn()
  render(<><Button size="sm" type="button" onClick={onClick}>Enabled</Button>
    <Button size="icon-sm" aria-label="Disabled" disabled onClick={onClick} /></>)
  fireEvent.click(screen.getByRole("button", { name: "Enabled" }))
  expect(onClick).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole("button", { name: "Disabled" }))
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("button", { name: "Enabled" }).getAttribute("type")).toBe("button")
})
