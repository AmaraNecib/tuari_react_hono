// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CollapsibleSection } from "./collapsible-section"

const CONTENT = "المحتوى المخفي"

describe("CollapsibleSection", () => {
  it("renders the title and keeps content unmounted while collapsed by default", () => {
    render(
      <CollapsibleSection title="قسم قابل للطي">
        <p>{CONTENT}</p>
      </CollapsibleSection>,
    )

    const button = screen.getByRole("button", { name: "قسم قابل للطي" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    // No dangling aria-controls while there is no region to control.
    expect(button.hasAttribute("aria-controls")).toBe(false)
    // Conditional rendering keeps collapsed content out of the DOM/a11y tree.
    expect(screen.queryByText(CONTENT)).toBeNull()
  })

  it("renders content expanded by default when defaultOpen is true", () => {
    render(
      <CollapsibleSection title="قسم مفتوح" defaultOpen>
        <p>{CONTENT}</p>
      </CollapsibleSection>,
    )

    const button = screen.getByRole("button", { name: "قسم مفتوح" })
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(CONTENT)).not.toBeNull()
  })

  it("toggles open/closed on click and wires the labelled region correctly", () => {
    render(
      <CollapsibleSection title="قسم قابل للتبديل">
        <p>{CONTENT}</p>
      </CollapsibleSection>,
    )

    const button = screen.getByRole("button", { name: "قسم قابل للتبديل" })
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")

    const region = screen.getByRole("region")
    expect(screen.getByText(CONTENT)).not.toBeNull()
    // The toggle points at the region and the region is labelled by the toggle.
    expect(button.getAttribute("aria-controls")).toBe(region.id)
    expect(region.getAttribute("aria-labelledby")).toBe(button.id)

    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText(CONTENT)).toBeNull()
  })

  it("keeps its open state across parent re-renders", () => {
    const view = render(
      <CollapsibleSection title="قسم مستقر">
        <p>{CONTENT}</p>
      </CollapsibleSection>,
    )

    fireEvent.click(screen.getByRole("button", { name: "قسم مستقر" }))
    // A parent re-render that does not remount the section must not collapse it.
    view.rerender(
      <CollapsibleSection title="قسم مستقر">
        <p>{CONTENT}</p>
      </CollapsibleSection>,
    )

    expect(screen.getByRole("button", { name: "قسم مستقر" }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(CONTENT)).not.toBeNull()
  })
})