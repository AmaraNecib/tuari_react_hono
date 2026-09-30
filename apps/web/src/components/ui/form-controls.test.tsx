// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Input } from "./input"
import { CurrencyInput, FileInput, NativeSelect, Textarea } from "./form-controls"

/**
 * The form controls share `formControlClassName`, so a placeholder-contrast
 * regression in one place hits every input. Dark mode carries a separate
 * full-opacity `dark:placeholder:*` override because the /80 composite lands at
 * roughly 5:1 on the dark input surface. These tests pin the token classes
 * (not a colour literal) on each control that renders a placeholder.
 */

/** Exact className tokens, so `…-muted-foreground/80` cannot satisfy `…-muted-foreground`. */
function classTokens(element: Element): string[] {
  return (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
}

function fileInputElement() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

afterEach(cleanup)

describe("form control placeholder contrast", () => {
  it("bumps the placeholder to the full-opacity muted token in dark mode", () => {
    render(<Input placeholder="اسم" />)

    const tokens = classTokens(screen.getByPlaceholderText("اسم"))
    expect(tokens).toContain("placeholder:text-muted-foreground/80")
    expect(tokens).toContain("dark:placeholder:text-muted-foreground")
    expect(tokens).not.toContain("dark:placeholder:text-muted-foreground/80")
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
    for (const element of [textarea, currency]) {
      const tokens = classTokens(element)
      expect(tokens).toContain("dark:placeholder:text-muted-foreground")
      expect(tokens).not.toContain("dark:placeholder:text-muted-foreground/80")
    }
  })

  it("keeps the native select on the shared control class", () => {
    render(
      <NativeSelect aria-label="filter">
        <option value="a">أ</option>
      </NativeSelect>,
    )

    // The native popup is themed by `color-scheme` in styles.css; the control
    // itself must keep the shared class so the global `select` rule and the
    // dark placeholder override stay on one definition.
    const tokens = classTokens(screen.getByLabelText("filter"))
    expect(tokens).toContain("text-foreground")
    expect(tokens).toContain("dark:[color-scheme:dark]")
    expect(tokens).toContain("dark:placeholder:text-muted-foreground")
  })
})

describe("FileInput", () => {
  it("shows the chosen file name after a selection and forwards onChange", () => {
    const onChange = vi.fn()
    render(<FileInput onChange={onChange} />)

    expect(screen.getByText("لم يتم اختيار ملف")).not.toBeNull()

    fireEvent.change(fileInputElement(), {
      target: { files: [new File(["bytes"], "facture.pdf", { type: "application/pdf" })] },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByText("facture.pdf")).not.toBeNull()
    expect(screen.queryByText("لم يتم اختيار ملف")).toBeNull()
  })

  it("shows a count for a multi-file selection", () => {
    render(<FileInput multiple />)

    fireEvent.change(fileInputElement(), {
      target: {
        files: [
          new File(["a"], "facture.pdf", { type: "application/pdf" }),
          new File(["b"], "photo.png", { type: "image/png" }),
        ],
      },
    })

    expect(screen.getByText("تم اختيار 2 ملفات")).not.toBeNull()
  })
})
