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
