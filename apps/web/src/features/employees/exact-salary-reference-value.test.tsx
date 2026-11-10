import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ExactSalaryReferenceValue } from "./exact-salary-reference-value"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"

afterEach(cleanup)
beforeEach(() => setMoneyGrouping(false))

describe("exact salary reference display", () => {
  it("shows an optional four-place daily rate without converting it to finalized cash", () => {
    render(<ExactSalaryReferenceValue reference={{ period: "DAILY", amount: "1500.1250" }} />)
    expect(screen.getByText("1500.125")).toBeTruthy()
    expect(screen.getByText("دج").parentElement?.getAttribute("dir")).toBe("ltr")
    expect(screen.queryByText("1500.13")).toBeNull()
  })

  it("uses the shared grouping preference for four-place reference text", () => {
    setMoneyGrouping(true)
    render(<ExactSalaryReferenceValue reference={{ period: "DAILY", amount: "1500.1250" }} />)
    expect(screen.getByText("1,500.125")).toBeTruthy()
  })

  it("keeps full-range period digits and distinct NULL versus zero states", () => {
    const view = render(<ExactSalaryReferenceValue reference={{ period: "MONTHLY", amount: "90071992547409.93" }} />)
    expect(screen.getByText("90071992547409.93")).toBeTruthy()
    view.rerender(<ExactSalaryReferenceValue reference={{ period: "DAILY", amount: "1250.0000" }} />)
    expect(screen.getByText("1250")).toBeTruthy()
    view.rerender(<ExactSalaryReferenceValue reference={{ period: "MONTHLY", amount: "0.00" }} />)
    expect(screen.getByText("0")).toBeTruthy()
    view.rerender(<ExactSalaryReferenceValue reference={null} />)
    expect(screen.queryByText("0")).toBeNull()
    expect(screen.getByText("غير محدد")).toBeTruthy()
  })
})
