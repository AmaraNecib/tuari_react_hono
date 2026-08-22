// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CreateableSelect } from "./createable-select"

function renderSelect({
  value = "",
  onChange = vi.fn(),
  options = [{ id: "wh-1", name: "المستودع المركزي" }],
  emptyLabel = "بدون مستودع",
}: {
  value?: string
  onChange?: (value: string) => void
  options?: Array<{ id: string; name: string }>
  emptyLabel?: string
}) {
  const utils = render(
    <label>
      المستودع الافتراضي
      <CreateableSelect value={value} onChange={onChange} options={options} emptyLabel={emptyLabel} />
    </label>,
  )
  const trigger = screen.getByRole("combobox")
  return { trigger, ...utils }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("CreateableSelect display name derivation", () => {
  it("shows the empty label when no value is selected", () => {
    renderSelect({ value: "" })
    expect(screen.getByRole("combobox").textContent).toContain("بدون مستودع")
  })

  it("shows the matching option's name for a selected value instead of the raw id", async () => {
    renderSelect({ value: "wh-1" })
    expect(screen.getByRole("combobox").textContent).toContain("المستودع المركزي")
    expect(screen.getByRole("combobox").textContent).not.toContain("wh-1")
  })

  it("falls back to the raw value when the selected id has no matching option", () => {
    renderSelect({ value: "wh-999", options: [] })
    expect(screen.getByRole("combobox").textContent).toContain("wh-999")
  })

  it("prefers an explicit displayValue prop over the matched option name", () => {
    render(
      <label>
        المستودع الافتراضي
        <CreateableSelect
          value="wh-1"
          onChange={vi.fn()}
          options={[{ id: "wh-1", name: "المستودع المركزي" }]}
          emptyLabel="بدون مستودع"
          displayValue="مخزن الطوارئ"
        />
      </label>,
    )
    expect(screen.getByRole("combobox").textContent).toContain("مخزن الطوارئ")
  })

  it("keeps the selection visible across re-renders after picking an option", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SelectHarness onChange={onChange} />)
    const trigger = screen.getByRole("combobox")

    fireEvent.mouseDown(trigger)
    const popup = await screen.findByRole("listbox")
    const option = await within(popup).findByRole("option", { name: "مستودع المبيعات" })
    fireEvent.mouseEnter(option)
    fireEvent.click(option)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("wh-2"))
    rerender(<SelectHarness onChange={onChange} />)
    expect(screen.getByRole("combobox").textContent).toContain("مستودع المبيعات")
    expect(screen.getByRole("combobox").textContent).not.toContain("بدون مستودع")
  })
})

function SelectHarness({ onChange }: { onChange: (value: string) => void }) {
  return (
    <label>
      المستودع الافتراضي
      <CreateableSelect
        value="wh-2"
        onChange={onChange}
        options={[
          { id: "wh-1", name: "المستودع المركزي" },
          { id: "wh-2", name: "مستودع المبيعات" },
        ]}
        emptyLabel="بدون مستودع"
      />
    </label>
  )
}
