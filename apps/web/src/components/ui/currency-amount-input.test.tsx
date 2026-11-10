import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CurrencyAmountInput } from "./currency-amount-input"

afterEach(cleanup)

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

  it("uses a non-submit full-payment button without rounding its label", () => {
    const pay = vi.fn()
    render(<CurrencyAmountInput exact label="المبلغ" value="" maxAmount="92233720368547758.07" onChange={vi.fn()} onPayFull={pay} />)
    const button = screen.getByRole("button", { name: "دج 92,233,720,368,547,758.07" })
    expect(button.getAttribute("type")).toBe("button")
    const run = button.querySelector('span[dir="ltr"]')!
    expect(run.firstElementChild?.textContent).toBe("دج")
    expect(run.lastElementChild?.textContent).toBe("92,233,720,368,547,758.07")
    fireEvent.click(button)
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it("retains the legacy numeric max formatting", () => {
    render(<CurrencyAmountInput label="قديم" value="10" maxAmount={10} onChange={vi.fn()} onPayFull={vi.fn()} />)
    expect(screen.getByRole("button").textContent).toBe("دج 10.00")
  })
})
