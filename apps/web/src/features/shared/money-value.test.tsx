// @vitest-environment jsdom

import "@/i18n"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MoneyFormatSetting } from "@/features/preferences/money-format-setting"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"
import { MoneyValue } from "./money-value"

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setMoneyGrouping(true)
})

describe("exact opt-in MoneyValue", () => {
  it("keeps adjacent large minor amounts distinct with grouping and optional decimals", () => {
    const view = render(<MoneyValue exact value="90071992547409.93" currencyLabel="دج" />)
    expect(view.container.textContent).toBe("دج 90,071,992,547,409.93")
    view.rerender(<MoneyValue exact value="90071992547409.92" currencyLabel="دج" />)
    expect(view.container.textContent).toBe("دج 90,071,992,547,409.92")
    act(() => setMoneyGrouping(false))
    expect(view.container.textContent).toBe("دج 90071992547409.92")
  })

  it.each(["table", "detail"] as const)("isolates signed exact digits from Arabic currency in %s mode", variant => {
    const view = render(<p dir="rtl">المبلغ: <MoneyValue exact value="-1234.50" currencyLabel="دج" signed variant={variant} /></p>)
    const digits = view.container.querySelector("bdi[dir=ltr]")
    expect(digits?.textContent).toBe("-1,234.5")
    expect(digits?.textContent).not.toContain("دج")
  })

  it("renders wide exact aggregates without imposing persisted bounds", () => {
    const view = render(<MoneyValue exact aggregate value="184467440737095516.14" currencyLabel="دج" signed />)
    expect(view.container.textContent).toBe("دج +184,467,440,737,095,516.14")
    view.rerender(<MoneyValue exact aggregate value="-184467440737095516.00" currencyLabel="دج" signed />)
    expect(view.container.textContent).toBe("دج -184,467,440,737,095,516")
    view.rerender(<MoneyValue exact value="-0.00" currencyLabel="دج" zeroAsDash />)
    expect(view.container.textContent).toBe("—")
  })
})

describe("MoneyValue", () => {
  it.each([true, false])("uses a physical LTR currency-then-number layout for exact=%s in Arabic prose", exact => {
    const view = render(<p dir="rtl">المبلغ: {exact
      ? <MoneyValue exact value="-12500.25" currencyLabel="دج" />
      : <MoneyValue value={-12500.25} currencyLabel="دج" />}</p>)
    const run = view.container.querySelector('span[dir="ltr"]')!
    expect(run.className).toContain("inline-flex")
    expect(run.firstElementChild?.textContent).toBe("دج")
    expect(run.lastElementChild?.tagName).toBe("BDI")
    expect(run.lastElementChild?.textContent).toBe("-12,500.25")
  })
  it.each([
    [0, "0", "0"],
    [12.5, "12.5", "12.5"],
    [999, "999", "999"],
    [1000, "1,000", "1000"],
    [1234, "1,234", "1234"],
    [1234.56, "1,234.56", "1234.56"],
    [1234567890.12, "1,234,567,890.12", "1234567890.12"],
  ])("renders %s with optional decimals in either grouping mode", (value, grouped, plain) => {
    const view = render(<MoneyValue value={value} currencyLabel="DZD" />)
    expect(view.container.textContent).toBe("DZD " + grouped)
    expect(view.container.firstElementChild?.getAttribute("dir")).toBe("ltr")
    act(() => setMoneyGrouping(false))
    expect(view.container.textContent).toBe("DZD " + plain)
  })

  it.each([[1234.56, "+1,234.56"], [-1234.56, "-1,234.56"], [0, "+0"]])(
    "retains signed differences for %s and detail typography", (value, expected) => {
      const view = render(<MoneyValue value={value} currencyLabel="دج" variant="detail" signed toneClassName="text-rose-700" />)
      expect(screen.getByText(expected).textContent).toBe(expected)
      expect(view.container.firstElementChild?.className).toContain("gap-1.5")
      expect(view.container.firstElementChild?.className).toContain("text-rose-700")
      expect(view.container.firstElementChild?.getAttribute("dir")).toBe("ltr")
      expect(screen.getByText("دج")).toBeTruthy()
    },
  )

  it("uses a dash only for an explicitly requested zero difference", () => {
    const view = render(<MoneyValue value={0} currencyLabel="DZD" zeroAsDash toneClassName="text-rose-700" />)
    expect(view.container.textContent).toBe("—")
    expect(view.container.firstElementChild?.className).toContain("text-rose-700")
    view.rerender(<MoneyValue value={0.01} currencyLabel="DZD" zeroAsDash />)
    expect(view.container.textContent).toBe("DZD 0.01")
  })

  it("updates both presentations from Settings and preserves the choice after remount", () => {
    const view = render(<><MoneyFormatSetting /><MoneyValue value={1234.56} currencyLabel="DZD" /><MoneyValue value={1234.56} currencyLabel="دج" variant="detail" /></>)
    fireEvent.change(screen.getByRole("combobox", { name: /^فواصل الآلاف في المبالغ/ }), { target: { value: "plain" } })
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1234.56")).toBeTruthy()
    expect(screen.getAllByText("1234.56", { exact: true })).toHaveLength(2)
    expect(screen.getByText("1234.56 / 1234")).toBeTruthy()
    view.unmount()
    render(<><MoneyFormatSetting /><MoneyValue value={1234} currencyLabel="DZD" /></>)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("plain")
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1234")).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "grouped" } })
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1,234")).toBeTruthy()
  })

  it("keeps the selected format for this session when storage is full", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError")
    })
    const view = render(<><MoneyFormatSetting /><MoneyValue value={1234.56} currencyLabel="DZD" /></>)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "plain" } })
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1234.56")).toBeTruthy()
    expect(screen.getByText("1234.56 / 1234")).toBeTruthy()
    view.unmount()
    render(<><MoneyFormatSetting /><MoneyValue value={1234.56} currencyLabel="DZD" /></>)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("plain")
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1234.56")).toBeTruthy()
    write.mockRestore()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "grouped" } })
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1,234.56")).toBeTruthy()
    expect(window.localStorage.getItem("tuari.moneyGrouping")).toBe("grouped")
  })

  it("renders safely and changes format when storage access is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError")
    })
    render(<><MoneyFormatSetting /><MoneyValue value={1234.56} currencyLabel="DZD" /></>)
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1,234.56")).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "plain" } })
    expect(screen.getByText((_, element) => element?.matches('span[dir="ltr"]') === true && element.textContent === "DZD 1234.56")).toBeTruthy()
  })

  it("uses grouped defaults for invalid storage and follows cross-tab changes and clearing", () => {
    window.localStorage.setItem("tuari.moneyGrouping", "unknown")
    const view = render(<MoneyValue value={1234.56} currencyLabel="DZD" />)
    expect(view.container.textContent).toBe("DZD 1,234.56")
    act(() => {
      window.localStorage.setItem("tuari.moneyGrouping", "plain")
      window.dispatchEvent(new StorageEvent("storage", { key: "tuari.moneyGrouping" }))
    })
    expect(view.container.textContent).toBe("DZD 1234.56")
    act(() => {
      window.localStorage.clear()
      window.dispatchEvent(new StorageEvent("storage", { key: null }))
    })
    expect(view.container.textContent).toBe("DZD 1,234.56")
  })
})
