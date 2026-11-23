import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CurrencyProse } from "./currency-prose"

afterEach(cleanup)

describe("preformatted currency in generated Arabic prose", () => {
  it.each([
    ["الراتب 1234.5678 دج / يوم", "1234.5678", "دج"],
    ["القيمة -50,000.25 دج، الرصيد", "-50,000.25", "دج"],
    ["المدفوع +1.500,25 د.ج.", "+1.500,25", "د.ج"],
    ["المبلغ 0 دج", "0", "دج"],
    ["القيمة −١٬٢٣٤٫٥٠ دج", "−١٬٢٣٤٫٥٠", "دج"],
    ["الراتب 1e+21 دج", "1e+21", "دج"],
  ])("isolates the unchanged numeric run in %s", (text, amount, label) => {
    const { container } = render(<CurrencyProse text={text} />)
    const numeric = container.querySelector('bdi[dir="ltr"]')!
    expect(numeric?.textContent).toBe(amount)
    expect(numeric.parentElement?.getAttribute("dir")).toBe("ltr")
    expect(numeric.previousElementSibling?.textContent).toBe(label)
    expect(numeric.previousElementSibling?.getAttribute("dir")).toBe("rtl")
    expect(container.textContent).toBe(text.replace(`${amount} ${label}`, `${label} ${amount}`))
  })

  it("preserves unrelated prose, dates, quantities and multiple amounts", () => {
    const text = "في 2026-10-15: 3 وحدات، المبلغ 10 دج والمتبقي -2.50 دج."
    const { container } = render(<CurrencyProse text={text} />)
    expect([...container.querySelectorAll("bdi")].map(el => el.textContent)).toEqual(["10", "-2.50"])
    expect(container.textContent).toBe("في 2026-10-15: 3 وحدات، المبلغ دج 10 والمتبقي دج -2.50.")
  })

  it("does not interpret text as HTML or turn arbitrary digits into currency", () => {
    const text = '<img src=x onerror=alert(1)> 2 وحدات، INV123 دج INV-123 دج 1..2 دج'
    const { container } = render(<CurrencyProse text={text} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("bdi")).toBeNull()
    expect(container.textContent).toBe(text)
  })
})
