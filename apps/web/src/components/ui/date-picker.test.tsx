// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DatePicker } from "./date-picker"

/**
 * The shared DatePicker is the single seam between the app's canonical
 * `yyyy-MM-dd` day (what `getAlgeriaDateInputValue` produces and
 * `toAlgeriaDayBoundaryIso` consumes) and its `dd/MM/yyyy` display. These tests
 * drive the real picker so a regression in either direction fails here rather
 * than silently blanking a field on some screen.
 */

function openPicker() {
  fireEvent.click(screen.getByRole("button"))
}

function pickDay(isoDay: string) {
  const cell = document.querySelector(`[data-day="${isoDay}"]`)
  expect(cell).not.toBeNull()
  const button = cell?.querySelector("button") ?? (cell as HTMLElement)
  fireEvent.click(button)
}

describe("DatePicker value contract", () => {
  afterEach(cleanup)

  it("renders a canonical yyyy-MM-dd value as its dd/MM/yyyy display day", () => {
    render(<DatePicker value="2026-10-01" onChange={vi.fn()} />)

    expect(screen.getByRole("button").textContent).toContain("01/10/2026")
  })

  it("emits the picked day as canonical yyyy-MM-dd, never dd/MM/yyyy", () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-10-01" onChange={onChange} />)

    openPicker()
    pickDay("2026-10-15")

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith("2026-10-15")
  })

  it("normalizes a legacy dd/MM/yyyy value and still emits canonical on pick", () => {
    const onChange = vi.fn()
    render(<DatePicker value="01/10/2026" onChange={onChange} />)

    expect(screen.getByRole("button").textContent).toContain("01/10/2026")

    openPicker()
    pickDay("2026-10-20")

    expect(onChange).toHaveBeenCalledWith("2026-10-20")
  })

  it("shows the placeholder for an empty value and picks canonical", () => {
    const onChange = vi.fn()
    render(<DatePicker value="" onChange={onChange} placeholder="dd/mm/yyyy" />)

    expect(screen.getByRole("button").textContent).toContain("dd/mm/yyyy")

    openPicker()
    // An empty value has no month to anchor on, so the calendar opens on the
    // current month; pick "today" (always present) and assert the emitted
    // shape is a canonical day.
    const today = document.querySelector("[data-today='true']")
    expect(today).not.toBeNull()
    const button = today?.querySelector("button") ?? (today as HTMLElement)
    fireEvent.click(button)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("submits the canonical day through the hidden form input", () => {
    const { container } = render(
      <DatePicker value="2026-10-01" onChange={vi.fn()} name="day" />,
    )

    const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement
    expect(hidden.value).toBe("2026-10-01")
  })

  it("normalizes a legacy dd/mm/yyyy value in the hidden form input", () => {
    const { container } = render(
      <DatePicker value="01/10/2026" onChange={vi.fn()} name="day" />,
    )

    const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement
    expect(hidden.value).toBe("2026-10-01")
  })

  it("treats a value in neither format as empty so the placeholder shows", () => {
    render(<DatePicker value="not-a-day" onChange={vi.fn()} />)

    expect(screen.getByRole("button").textContent).toContain("dd/mm/yyyy")
  })

  it("treats an out-of-range canonical day as empty", () => {
    render(<DatePicker value="2026-13-40" onChange={vi.fn()} />)

    expect(screen.getByRole("button").textContent).toContain("dd/mm/yyyy")
  })
})

describe("DatePicker month navigation is theme-aware", () => {
  afterEach(cleanup)

  it("paints the nav chevrons with the inherited ink token instead of the black default", () => {
    render(<DatePicker value="2026-10-01" onChange={vi.fn()} />)
    openPicker()

    // react-day-picker ships a <polygon> with no fill, so the SVG default
    // (black) painted it in both themes. `fill-current` makes every nav
    // chevron follow the button's `text-ink-3` (light in dark mode).
    const chevrons = document.querySelectorAll("nav svg")
    expect(chevrons.length).toBeGreaterThan(0)
    for (const chevron of chevrons) {
      expect(chevron.getAttribute("class") ?? "").toContain("fill-current")
    }
  })

  it("gives both nav buttons hover, focus and aria-disabled states", () => {
    render(<DatePicker value="2026-10-01" onChange={vi.fn()} />)
    openPicker()

    const buttons = Array.from(document.querySelectorAll("nav button"))
    // The picker renders a previous and a next button, so a fix applied to
    // only one of the two class strings must fail here.
    expect(buttons.length).toBe(2)
    for (const button of buttons) {
      const className = button.getAttribute("class") ?? ""
      const tokens = className.split(/\s+/).filter(Boolean)
      expect(className).toContain("text-ink-3")
      expect(className).toContain("hover:text-ink")
      // react-day-picker marks an unavailable month with `aria-disabled` and
      // `tabIndex={-1}`; it never sets the native `disabled` attribute, so a
      // `disabled:` variant would be dead CSS.
      expect(className).toContain("aria-disabled:cursor-not-allowed")
      expect(className).toContain("aria-disabled:opacity-40")
      expect(className).toContain("aria-disabled:hover:bg-transparent")
      expect(className).toContain("aria-disabled:hover:text-ink-3")
      expect(className).toContain("focus-visible:outline-2")
      expect(className).toContain("focus-visible:outline-primary")
      expect(className).toContain("focus-visible:outline-offset-1")
      expect(tokens.some((token) => token.startsWith("disabled:"))).toBe(false)
    }
  })
})
