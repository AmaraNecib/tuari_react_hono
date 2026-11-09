// @vitest-environment jsdom

import "@/i18n"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MoneyFormatSetting } from "@/features/preferences/money-format-setting"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"
import { MoneyValue } from "./money-value"

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe("MoneyValue", () => {
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
    expect(screen.getByText("DZD 1234.56")).toBeTruthy()
    expect(screen.getByText("1234.56", { exact: true })).toBeTruthy()
    expect(screen.getByText("1234.56 / 1234")).toBeTruthy()
    view.unmount()
    render(<><MoneyFormatSetting /><MoneyValue value={1234} currencyLabel="DZD" /></>)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("plain")
    expect(screen.getByText("DZD 1234")).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "grouped" } })
    expect(screen.getByText("DZD 1,234")).toBeTruthy()
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
