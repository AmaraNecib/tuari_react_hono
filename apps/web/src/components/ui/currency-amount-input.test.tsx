import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CurrencyAmountInput } from "./currency-amount-input"

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("opt-in exact CurrencyAmountInput", () => {
  it("compares adjacent large amounts exactly and keeps draft strings intact", () => {
    const onChange = vi.fn()
    const view = render(<CurrencyAmountInput exact label="المبلغ" value="90071992547409.93" maxAmount="90071992547409.92" onChange={onChange} />)
    const input = screen.getByRole("textbox", { name: "المبلغ" })
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toContain("90,071,992,547,409.92")
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
    fireEvent.change(input, { target: { value: "١٢٫" } })
    expect(onChange).toHaveBeenCalledWith("١٢٫")
    view.rerender(<CurrencyAmountInput exact label="المبلغ" value="90071992547409.92" maxAmount="90071992547409.92" onChange={onChange} />)
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("validates precision on blur without converting or overwriting the draft", () => {
    const view = render(<CurrencyAmountInput exact label="المبلغ" value="1.005" onChange={vi.fn()} />)
    const input = screen.getByRole("textbox", { name: "المبلغ" }) as HTMLInputElement
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.blur(input)
    expect(input.value).toBe("1.005")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toContain("منزلتين")
    view.rerender(<CurrencyAmountInput exact label="المبلغ" value="0" disabled onChange={vi.fn()} />)
    expect(input.disabled).toBe(true)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("uses a clearly named non-submit full-payment button and preserves the full amount description", () => {
    const pay = vi.fn()
    render(<CurrencyAmountInput exact label="المبلغ" value="" maxAmount="92233720368547758.07" onChange={vi.fn()} onPayFull={pay} />)
    const button = screen.getByRole("button", { name: "كامل المبلغ" })
    expect(button.getAttribute("type")).toBe("button")
    const description = document.getElementById(button.getAttribute("aria-describedby")!)!
    expect(description.textContent).toBe("المتبقي: دج 92,233,720,368,547,758.07")
    expect(button.textContent).not.toContain("92,233")
    fireEvent.click(button)
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it("follows hover capability rather than viewport width and keeps the amount accessible", () => {
    let changed = () => {}
    const media = { matches: true, addEventListener: vi.fn((_type: string, listener: () => void) => { changed = listener }), removeEventListener: vi.fn() }
    vi.stubGlobal("matchMedia", vi.fn(() => media))
    const view = render(<CurrencyAmountInput exact label="المبلغ" value="0" maxAmount="12500.25" onChange={vi.fn()} onPayFull={vi.fn()} />)
    const button = screen.getByRole("button", { name: "كامل المبلغ" })
    const description = document.getElementById(button.getAttribute("aria-describedby")!)!
    expect(description.className).toBe("sr-only")
    expect(description.textContent).toBe("المتبقي: دج 12,500.25")
    act(() => { media.matches = false; changed() })
    expect(description.className).not.toContain("sr-only")
    expect(screen.queryByText(/بالفأرة/)).toBeNull()
    view.unmount()
    expect(media.removeEventListener).toHaveBeenCalled()
  })

  it("keeps disabled full-payment controls inert and does not invent a button without a callback", () => {
    const pay = vi.fn()
    const view = render(<CurrencyAmountInput exact label="المبلغ" value="0" maxAmount="10" disabled onChange={vi.fn()} onPayFull={pay} />)
    fireEvent.click(screen.getByRole("button", { name: "كامل المبلغ" }))
    expect(pay).not.toHaveBeenCalled()
    view.rerender(<CurrencyAmountInput exact label="المبلغ" value="0" maxAmount="10" onChange={vi.fn()} />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("retains the legacy numeric max formatting", () => {
    render(<CurrencyAmountInput label="قديم" value="10" maxAmount={10} onChange={vi.fn()} onPayFull={vi.fn()} />)
    expect(screen.getByRole("button").textContent).toBe("كامل المبلغ")
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "دج 10.00")).toBeTruthy()
    expect(screen.getByRole("textbox").parentElement?.parentElement?.className).toContain("min-w-0")
  })
})
