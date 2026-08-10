// @vitest-environment jsdom
import "@/i18n"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { SearchDialog, type SearchItem } from "./search-dialog"

afterEach(() => cleanup())

function makeItems() {
  return [
    {
      id: "warehouses",
      title: "المستودعات",
      description: "قائمة المستودعات",
      children: [{ id: "warehouse-new", title: "مستودع جديد", action: vi.fn() }],
    },
    { id: "employees", title: "الموظفون", action: vi.fn() },
  ] satisfies SearchItem[]
}

describe("SearchDialog", () => {
  it("renders a modal dialog with combobox/listbox semantics when open", () => {
    const items = makeItems()
    render(<SearchDialog isOpen onClose={vi.fn()} onQueryChange={vi.fn()} results={items} />)

    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("aria-label")).toBe("البحث")

    const combobox = screen.getByRole("combobox")
    // Accessible name comes from aria-label, not just placeholder.
    expect(combobox.getAttribute("aria-label")).toBe("بحث...")
    expect(combobox.getAttribute("aria-expanded")).toBe("true")
    expect(combobox.getAttribute("aria-controls")).toBe("search-results-listbox")

    const listbox = screen.getByRole("listbox")
    expect(listbox.getAttribute("aria-label")).toBe("نتائج البحث")
    expect(screen.getAllByRole("option")).toHaveLength(2)
    expect(screen.getByRole("option", { name: /الموظفون/ }).getAttribute("aria-selected")).toBe("false")
  })

  it("does not render the dialog when closed", () => {
    render(<SearchDialog isOpen={false} onClose={vi.fn()} onQueryChange={vi.fn()} results={[]} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("moves focus to the search input when opened", async () => {
    render(<SearchDialog isOpen onClose={vi.fn()} onQueryChange={vi.fn()} results={[]} />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox")))
  })

  it("reports the active option through aria-activedescendant and aria-selected", () => {
    const items = makeItems()
    render(<SearchDialog isOpen onClose={vi.fn()} onQueryChange={vi.fn()} results={items} />)

    const combobox = screen.getByRole("combobox")
    expect(combobox.getAttribute("aria-activedescendant")).toBe("search-option-warehouses")

    fireEvent.keyDown(combobox, { key: "ArrowDown" })
    expect(combobox.getAttribute("aria-activedescendant")).toBe("search-option-employees")
    expect(screen.getByRole("option", { name: /الموظفون/ }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("option", { name: /المستودعات/ }).getAttribute("aria-selected")).toBe("false")
  })

  it("notifies the parent of query changes", () => {
    const onQueryChange = vi.fn()
    render(<SearchDialog isOpen onClose={vi.fn()} onQueryChange={onQueryChange} results={[]} />)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "مستودع" } })
    expect(onQueryChange).toHaveBeenCalledWith("مستودع")
  })

  it("Enter activates the highlighted action item and closes the dialog", () => {
    const items = makeItems()
    const employeesAction = items[1]!.action as ReturnType<typeof vi.fn>
    const onClose = vi.fn()
    render(<SearchDialog isOpen onClose={onClose} onQueryChange={vi.fn()} results={items} />)

    const combobox = screen.getByRole("combobox")
    fireEvent.keyDown(combobox, { key: "ArrowDown" })
    fireEvent.keyDown(combobox, { key: "Enter" })

    expect(employeesAction).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("Tab expands an item with children without closing the dialog", () => {
    const items = makeItems()
    const onClose = vi.fn()
    render(<SearchDialog isOpen onClose={onClose} onQueryChange={vi.fn()} results={items} />)

    const combobox = screen.getByRole("combobox")
    // Active item is the first result ("المستودعات", which has children).
    fireEvent.keyDown(combobox, { key: "Tab" })

    expect(onClose).not.toHaveBeenCalled()
    // The sub-list is now shown inside the same dialog.
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("option", { name: /مستودع جديد/ })).toBeTruthy()
    expect(screen.queryByRole("option", { name: /الموظفون/ })).toBeNull()
  })

  it("Tab on a plain action item does not run its action", () => {
    const items = makeItems()
    const employeesAction = items[1]!.action as ReturnType<typeof vi.fn>
    const onClose = vi.fn()
    render(<SearchDialog isOpen onClose={onClose} onQueryChange={vi.fn()} results={items} />)

    const combobox = screen.getByRole("combobox")
    fireEvent.keyDown(combobox, { key: "ArrowDown" })
    fireEvent.keyDown(combobox, { key: "Tab" })

    expect(employeesAction).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("Escape collapses the expanded view without closing the dialog", () => {
    const items = makeItems()
    const onClose = vi.fn()
    render(<SearchDialog isOpen onClose={onClose} onQueryChange={vi.fn()} results={items} />)

    const combobox = screen.getByRole("combobox")
    fireEvent.keyDown(combobox, { key: "Tab" })
    expect(screen.getByRole("option", { name: /مستودع جديد/ })).toBeTruthy()

    fireEvent.keyDown(combobox, { key: "Escape" })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeTruthy()
    // Back to the parent list.
    expect(screen.getByRole("option", { name: /المستودعات/ })).toBeTruthy()
  })

  it("Escape closes the dialog when not expanded", () => {
    const onClose = vi.fn()
    render(<SearchDialog isOpen onClose={onClose} onQueryChange={vi.fn()} results={[]} />)

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("names the icon-only close and back buttons", () => {
    const items = makeItems()
    render(<SearchDialog isOpen onClose={vi.fn()} onQueryChange={vi.fn()} results={items} />)

    expect(screen.getByRole("button", { name: "إغلاق" })).toBeTruthy()

    // Back button only appears in the expanded view.
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" })
    const back = screen.getByRole("button", { name: "رجوع" })
    expect(back).toBeTruthy()
  })
})
