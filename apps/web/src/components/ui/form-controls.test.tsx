// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Input } from "./input"
import { CurrencyInput, NativeSelect, Textarea } from "./form-controls"

/**
 * The form controls share `formControlClassName`, so a placeholder-contrast
 * regression in one place hits every input. In dark mode the token at /80
 * opacity composites to a low-contrast grey, so the shared class carries a
 * full-opacity `dark:placeholder:*` override. These tests pin the token class
 * (not a colour literal) on each control that renders a placeholder.
 */

afterEach(cleanup)

describe("form control placeholder contrast", () => {
  it("bumps the placeholder to the full-opacity muted token in dark mode", () => {
    render(<Input placeholder="اسم" />)

    const input = screen.getByPlaceholderText("اسم")
    expect(input.className).toContain("placeholder:text-muted-foreground/80")
    expect(input.className).toContain("dark:placeholder:text-muted-foreground")
  })

  it("carries the dark placeholder override on textarea and currency input", () => {
    const { container } = render(
      <>
        <Textarea placeholder="ملاحظة" />
        <CurrencyInput placeholder="0" />
      </>,
    )

    const textarea = screen.getByPlaceholderText("ملاحظة")
    const currency = container.querySelector('input[placeholder="0"]') as HTMLInputElement
    expect(textarea.className).toContain("dark:placeholder:text-muted-foreground")
    expect(currency.className).toContain("dark:placeholder:text-muted-foreground")
  })

  it("keeps the native select on the shared control class", () => {
    render(
      <NativeSelect aria-label="filter">
        <option value="a">أ</option>
      </NativeSelect>,
    )

    const select = screen.getByLabelText("filter")
    expect(select.className).toContain("text-foreground")
    expect(select.className).toContain("dark:[color-scheme:dark]")
  })
})
