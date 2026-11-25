// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { AmountDisplay, DataTable, EmptyState, PageHeader, SectionHeader, StatCard, StatusBadge, paginate } from "./index"

afterEach(cleanup)
it("composes the seven capabilities with caller copy, exact aggregates and accessible table navigation", () => {
  const onPageChange = vi.fn()
  const page = paginate(Array.from({ length: 61 }, (_, i) => i), 99, 10)
  expect(page.rows).toEqual([60])
  expect(page.page).toBe(7)
  render(<><PageHeader title="Debt workspace" description="Exact accounts" />
    <SectionHeader title="Balance" />
    <StatCard label="Payable" value={<AmountDisplay aggregate signed value="120000000000000000.01" currencyLabel="DZD" />} />
    <StatusBadge label="Voided" tone="bad" />
    <EmptyState title="No settlement" description="Select an account" />
    <DataTable label="Entries" pagination={{ ...page, label: "Entry pages", previousLabel: "Previous", nextLabel: "Next", countLabel: "61 of 61", onPageChange }}>
      <table><tbody><tr><td>Last entry</td></tr></tbody></table>
    </DataTable></>)
  expect(screen.getByRole("heading", { name: "Debt workspace", level: 1 })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Balance", level: 2 })).toBeTruthy()
  expect(screen.getByText("+120,000,000,000,000,000.01")).toBeTruthy()
  expect(screen.getByText("Voided")).toBeTruthy()
  expect(screen.getByRole("heading", { name: "No settlement" })).toBeTruthy()
  expect(screen.getByRole("region", { name: "Entries" }).textContent).toContain("Last entry")
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Previous" }))
  expect(onPageChange).toHaveBeenCalledWith(6)
})
it("clamps empty and shrinking datasets before slicing", () => {
  expect(paginate([], 7, 10)).toMatchObject({ rows: [], page: 1, pages: 1, start: 0, end: 0 })
  expect(paginate(["only"], 7, 15)).toMatchObject({ rows: ["only"], page: 1, total: 1 })
})
