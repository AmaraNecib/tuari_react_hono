// @vitest-environment jsdom
import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PaginationControls } from "./pagination-controls"

afterEach(() => cleanup())

/**
 * Tests for PaginationControls — the reusable UI component for cursor
 * pagination. The component is intentionally minimal:
 * - Shows "Previous" / "Next" buttons
 * - Disables Previous on first page, Next on last page
 * - Shows total / shown count
 * - Page-size selector that fires `onPageSizeChange`
 * - Forwards clicks via callbacks
 */
describe("PaginationControls", () => {
  it("renders Previous and Next buttons", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: /previous/i })).not.toBeNull()
    expect(screen.getByRole("button", { name: /next/i })).not.toBeNull()
  })

  it("disables Previous when on first page (no previous callback)", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={undefined}
        onNext={vi.fn()}
      />,
    )

    const button = screen.getByRole("button", { name: /previous/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("disables Next when there are no more pages", () => {
    render(
      <PaginationControls
        shownCount={100}
        total={100}
        hasMore={false}
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={undefined}
      />,
    )

    const button = screen.getByRole("button", { name: /next/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("calls onPrevious when Previous is clicked", () => {
    const onPrevious = vi.fn()

    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={onPrevious}
        onNext={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /previous/i }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it("calls onNext when Next is clicked", () => {
    const onNext = vi.fn()

    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={onNext}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it("renders a page-size selector with the default sizes", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const select = screen.getByRole("combobox") as HTMLSelectElement
    expect(select).not.toBeNull()
    const options = Array.from(select.options).map((opt) => opt.value)
    expect(options).toEqual(["10", "20", "50", "100"])
  })

  it("uses the custom availablePageSizes when provided", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={25}
        onPageSizeChange={vi.fn()}
        availablePageSizes={[25, 75]}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const select = screen.getByRole("combobox") as HTMLSelectElement
    const options = Array.from(select.options).map((opt) => opt.value)
    expect(options).toEqual(["25", "75"])
  })

  it("calls onPageSizeChange when the user picks a new size", () => {
    const onPageSizeChange = vi.fn()

    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={onPageSizeChange}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const select = screen.getByRole("combobox") as HTMLSelectElement
    fireEvent.change(select, { target: { value: "20" } })
    expect(onPageSizeChange).toHaveBeenCalledWith(20)
  })

  it("reflects the current pageSize in the selector", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={20}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const select = screen.getByRole("combobox") as HTMLSelectElement
    expect(select.value).toBe("20")
  })

  it("shows the total count", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={250}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        totalLabel="Total"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const matches = screen.getAllByText(/250/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it("shows zero total when no items", () => {
    render(
      <PaginationControls
        shownCount={0}
        total={0}
        hasMore={false}
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        totalLabel="Total"
        onPrevious={undefined}
        onNext={undefined}
      />,
    )

    const matches = screen.getAllByText(/0/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it("supports custom labels (Arabic)", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="السابق"
        nextLabel="التالي"
        totalLabel="إجمالي"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "السابق" })).not.toBeNull()
    expect(screen.getByRole("button", { name: "التالي" })).not.toBeNull()
    expect(screen.getByText(/إجمالي/)).not.toBeNull()
  })

  it("disables all controls while loading", () => {
    render(
      <PaginationControls
        shownCount={10}
        total={100}
        hasMore
        pageSize={50}
        onPageSizeChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        isLoading
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const previous = screen.getByRole("button", { name: /previous/i }) as HTMLButtonElement
    const next = screen.getByRole("button", { name: /next/i }) as HTMLButtonElement
    const select = screen.getByRole("combobox") as HTMLSelectElement

    expect(previous.disabled).toBe(true)
    expect(next.disabled).toBe(true)
    expect(select.disabled).toBe(true)
  })
})