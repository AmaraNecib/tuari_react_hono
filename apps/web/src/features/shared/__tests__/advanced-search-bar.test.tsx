// @vitest-environment jsdom
import "@/i18n"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { AdvancedSearchBar, type QuickFilter } from "../advanced-search-bar"

afterEach(() => cleanup())

const QUICK_FILTERS: QuickFilter[] = [
  { id: "paid", label: "Paid", filters: { status: "PAID" } },
  { id: "unpaid", label: "Unpaid", filters: { status: "UNPAID" } },
  { id: "active", label: "Active", filters: { status: "ACTIVE" } },
]

const STORAGE_KEY = "invoices-search-filters"

describe("AdvancedSearchBar", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders a search input with a debounced onSearch callback", async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(
      <AdvancedSearchBar
        onSearch={onSearch}
        storageKey={STORAGE_KEY}
      />
    )

    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "alpha" } })

    expect(onSearch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(350)
    expect(onSearch).toHaveBeenCalledWith("alpha", {})
    vi.useRealTimers()
  })

  it("renders quick filter chips and applies the matching filters on click", async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(
      <AdvancedSearchBar
        onSearch={onSearch}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Paid" }))
    await vi.advanceTimersByTimeAsync(350)
    expect(onSearch).toHaveBeenLastCalledWith("", { status: "PAID" })
    vi.useRealTimers()
  })

  it("marks the active quick filter chip with aria-pressed=true", () => {
    render(
      <AdvancedSearchBar
        onSearch={vi.fn()}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
        initialFilters={{ status: "UNPAID" }}
      />
    )

    const active = screen.getByRole("button", { name: "Unpaid" })
    expect(active.getAttribute("aria-pressed")).toBe("true")
  })

  it("clears active filters and the search query when Clear is pressed", async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(
      <AdvancedSearchBar
        onSearch={onSearch}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
        initialFilters={{ status: "PAID" }}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /مسح/ }))
    await vi.advanceTimersByTimeAsync(350)
    expect(onSearch).toHaveBeenLastCalledWith("", {})
    vi.useRealTimers()
  })

  it("does not flood history when filters are toggled back and forth", async () => {
    vi.useFakeTimers()
    render(
      <AdvancedSearchBar
        onSearch={vi.fn()}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
      />
    )

    const paid = screen.getByRole("button", { name: "Paid" })
    const unpaid = screen.getByRole("button", { name: "Unpaid" })

    // Click Paid, wait for debounce, click Unpaid, wait, click Paid again.
    fireEvent.click(paid)
    await vi.advanceTimersByTimeAsync(350)
    fireEvent.click(unpaid)
    await vi.advanceTimersByTimeAsync(350)
    fireEvent.click(paid)
    await vi.advanceTimersByTimeAsync(350)

    // Two distinct filter sets were applied; the bar should record each once.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    expect(stored.history).toHaveLength(2)
    vi.useRealTimers()
  })

  it("saves the current filter set as a named preset and shows it in the list", () => {
    const onSearch = vi.fn()
    render(
      <AdvancedSearchBar
        onSearch={onSearch}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
        initialFilters={{ status: "PAID" }}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /حفظ/i }))
    fireEvent.change(screen.getByPlaceholderText(/اسم/i), {
      target: { value: "My Paid List" },
    })
    fireEvent.click(screen.getByRole("button", { name: /^حفظ$/ }))

    const presetsButton = screen.getByRole("button", { name: /الفلاتر المحفوظة/ })
    fireEvent.click(presetsButton)

    expect(screen.getByText("My Paid List")).toBeDefined()
  })

  it("exposes a history dropdown that lists the last used filter sets", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        presets: [],
        history: [
          { filters: { status: "PAID" }, usedAt: Date.now() },
          { filters: { status: "UNPAID" }, usedAt: Date.now() - 1_000 },
        ],
      })
    )

    render(
      <AdvancedSearchBar
        onSearch={vi.fn()}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /حديثاً/ }))
    // The history shows a short label per entry — verify both entries are listed
    const list = screen.getByRole("list", { name: /الفلاتر الحديثة/ })
    expect(within(list).getByText(/status: PAID/)).toBeDefined()
    expect(within(list).getByText(/status: UNPAID/)).toBeDefined()
  })

  it("opens and closes a mobile drawer for filter controls", () => {
    render(
      <AdvancedSearchBar
        onSearch={vi.fn()}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
        forceMobileLayout
      />
    )

    const openButton = screen.getByRole("button", { name: "الفلاتر" })
    fireEvent.click(openButton)

    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(within(dialog).getByRole("button", { name: "Paid" })).toBeDefined()

    fireEvent.click(within(dialog).getByRole("button", { name: /إغلاق/ }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes the mobile drawer on Escape", () => {
    render(
      <AdvancedSearchBar
        onSearch={vi.fn()}
        storageKey={STORAGE_KEY}
        quickFilters={QUICK_FILTERS}
        forceMobileLayout
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "الفلاتر" }))
    expect(screen.getByRole("dialog")).toBeTruthy()

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
