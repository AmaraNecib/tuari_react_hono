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
    pickOption(option)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("wh-2"))
    rerender(<SelectHarness onChange={onChange} />)
    expect(screen.getByRole("combobox").textContent).toContain("مستودع المبيعات")
    expect(screen.getByRole("combobox").textContent).not.toContain("بدون مستودع")
  })
})

describe("CreateableSelect popup positioning/animation (issue #28)", () => {
  it("opens without the trigger-aligned mode or the scale animation", async () => {
    const trigger = renderSelect({ value: "wh-1" }).trigger
    fireEvent.mouseDown(trigger)
    const listbox = await screen.findByRole("listbox")
    // The popup is the scrolling container wrapping the Base UI list.
    const popup = listbox.closest('[data-slot="select-content"]') as HTMLElement | null
    expect(popup).not.toBeNull()
    // Trigger-aligned mode is OFF by default (alignItemWithTrigger=false). This
    // test pins that default: if the mode is ever restored — add
    // `data-align-trigger={...}` back to the Popup and re-enable
    // `origin-(--transform-origin)` / `data-[align-trigger=true]:animate-none` /
    // `zoom-in-95` in select.tsx — every assertion below MUST start failing, so
    // the regression (async fixed-position re-place behind the CDP box-model
    // race, issue #28) is caught here rather than in the browser.
    expect(popup!.getAttribute("data-align-trigger")).toBeNull()
    expect(popup!.className).toContain("fade-in-0")
    expect(popup!.className).not.toContain("zoom-in-95")
    expect(popup!.className).not.toContain("transform-origin")
    expect(popup!.className).not.toContain("animate-none")
  })

  it("commits a selection on successive open/close cycles", async () => {
    const onChange = vi.fn()
    const trigger = renderSelect({
      value: "",
      onChange,
      options: [
        { id: "wh-1", name: "المستودع المركزي" },
        { id: "wh-2", name: "مستودع المبيعات" },
      ],
    }).trigger

    // Cycle 1: open, pick the second option.
    fireEvent.mouseDown(trigger)
    let listbox = await screen.findByRole("listbox")
    const firstPick = await within(listbox).findByRole("option", { name: "مستودع المبيعات" })
    pickOption(firstPick)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("wh-2"))

    // Toggle-close (Base UI useClick: event "mousedown", toggle=true), reopen.
    // Note: we cannot assert the popup unmounts here — Base UI keeps it mounted
    // during the exit transition and jsdom never fires transitionend.
    fireEvent.mouseDown(trigger)
    fireEvent.mouseDown(trigger)
    listbox = await screen.findByRole("listbox")
    const secondPick = await within(listbox).findByRole("option", { name: "المستودع المركزي" })
    pickOption(secondPick)

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(onChange).toHaveBeenLastCalledWith("wh-1")
  })
})

describe("CreateableSelect clear + create dialog contract", () => {
  it("offers a row that clears the value back to empty when clearable", async () => {
    const onChange = vi.fn()
    render(
      <label>
        المدير المسؤول
        <CreateableSelect
          value="wh-1"
          onChange={onChange}
          options={[{ id: "wh-1", name: "المستودع المركزي" }]}
          emptyLabel="بدون مستودع"
          clearable
        />
      </label>,
    )

    fireEvent.mouseDown(screen.getByRole("combobox"))
    const listbox = await screen.findByRole("listbox")
    const clearOption = await within(listbox).findByRole("option", { name: "بدون مستودع" })
    pickOption(clearOption)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""))
  })

  it("cannot be dismissed while a create is in flight, so a late result still selects", async () => {
    let resolveCreate: (value: { id: string; name: string }) => void = () => {}
    const onCreate = vi.fn(
      () =>
        new Promise<{ id: string; name: string }>((resolve) => {
          resolveCreate = resolve
        }),
    )
    const onChange = vi.fn()

    render(
      <label>
        المدير المسؤول
        <CreateableSelect
          value=""
          onChange={onChange}
          options={[{ id: "wh-1", name: "المستودع المركزي" }]}
          emptyLabel="بدون مدير"
          createLabel="إضافة مدير"
          createFields={[{ key: "firstName", label: "الاسم", required: true }]}
          onCreate={onCreate}
        />
      </label>,
    )

    fireEvent.mouseDown(screen.getByRole("combobox"))
    const listbox = await screen.findByRole("listbox")
    const createOption = await within(listbox).findByRole("option", { name: /إضافة مدير/ })
    pickOption(createOption)

    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText(/الاسم/), { target: { value: "سعيد" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "إنشاء" }))

    // Cancel must be disabled while pending, and clicking it must not dismiss
    // the dialog — the in-flight create cannot be cancelled.
    const cancel = within(dialog).getByRole("button", { name: "إلغاء" }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.click(cancel)
    expect(screen.getByRole("dialog")).toBeTruthy()

    resolveCreate({ id: "emp-new-1", name: "سعيد بلقاسم" })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("emp-new-1"))
describe("CreateableSelect popup styling follows Base UI state attributes", () => {
  it("styles the popup surface and the highlighted/selected item with theme tokens", async () => {
    const trigger = renderSelect({ value: "wh-1" }).trigger
    fireEvent.mouseDown(trigger)
    const listbox = await screen.findByRole("listbox")
    const popup = listbox.closest('[data-slot="select-content"]') as HTMLElement | null
    expect(popup).not.toBeNull()

    // Popup surface uses the semantic popover tokens (same values as --surface),
    // so it stays legible in both themes without a colour literal.
    expect(popup!.className).toContain("bg-popover")
    expect(popup!.className).toContain("text-popover-foreground")

    const option = await within(listbox).findByRole("option", { name: "المستودع المركزي" })
    const optionClass = option.getAttribute("class") ?? ""
    // Base UI marks hover/keyboard highlight with `data-highlighted` and the
    // chosen row with `data-selected`; styling those (not bare `:focus`)
    // keeps the highlight following the pointer and the text dark-mode safe.
    expect(optionClass).toContain("data-[highlighted]:bg-accent")
    // Light mode keeps the paired --accent-foreground token; only dark mode
    // strengthens it to the full --foreground ink (light-on-dark surface).
    expect(optionClass).toContain("data-[highlighted]:text-accent-foreground")
    expect(optionClass).toContain("dark:data-[highlighted]:text-foreground")
    expect(optionClass).toContain("data-[selected]:font-medium")
  })
})

/**
 * item click only commits when the press started on the item itself
 * (`allowMouseSelectionRef`, set by pointerdown) — bare synthetic clicks are
 * treated as drag/ghost clicks and ignored. Playwright fires the full real
 * pointer sequence, so this only matters for the jsdom simulation here.
 */
function pickOption(option: Element) {
  fireEvent.pointerDown(option, { button: 0, pointerId: 1, pointerType: "mouse" })
  fireEvent.click(option)
}

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
