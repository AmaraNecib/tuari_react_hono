// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TableQueryState, type TableQuery } from "./table-primitives"

afterEach(cleanup)

function query(overrides: Partial<TableQuery> = {}): TableQuery {
  return { data: undefined, isPending: false, isError: false, isFetching: false, error: null, refetch: vi.fn().mockResolvedValue({}), ...overrides }
}

function view(state: TableQuery) {
  return <TableQueryState query={state} resource="دليل العناصر"><p>لا توجد عناصر</p></TableQueryState>
}

describe("TableQueryState", () => {
  it("announces initial loading without rendering the empty child", () => {
    render(view(query({ isPending: true, isFetching: true })))
    expect(screen.getByRole("status").textContent).toBe("جارٍ تحميل دليل العناصر...")
    expect(screen.queryByText("لا توجد عناصر")).toBeNull()
  })

  it("names the failed resource, shows the reason and retries without an empty claim", () => {
    const state = query({ isError: true, error: new Error("انقطع الاتصال بالخادم") })
    render(view(state))
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل دليل العناصر.")
    expect(screen.getByText("انقطع الاتصال بالخادم")).toBeTruthy()
    expect(screen.queryByText("لا توجد عناصر")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })

  it("provides Arabic recovery guidance when there is no usable error reason", () => {
    render(view(query({ isError: true, error: new Error("Input validation failed") })))
    expect(screen.getByText("لم يكتمل طلب البيانات. تحقق من الاتصال ثم أعد المحاولة.")).toBeTruthy()
    expect(screen.queryByText("Input validation failed")).toBeNull()
  })

  it("renders a successful empty result without an alert or loading message", () => {
    render(view(query({ data: { items: [] } })))
    expect(screen.getByText("لا توجد عناصر")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("preserves successful rows during a background refresh", () => {
    render(<TableQueryState query={query({ data: { items: [1] }, isFetching: true })} resource="دليل العناصر"><table><tbody><tr><td>مطرقة</td></tr></tbody></table></TableQueryState>)
    expect(screen.getByRole("cell", { name: "مطرقة" })).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("keeps retained rows visible and labels a failed refresh", () => {
    render(<TableQueryState query={query({ data: { items: [1] }, isError: true, error: new Error("انقطع الاتصال") })} resource="دليل العناصر"><p>مطرقة</p></TableQueryState>)
    expect(screen.getByText("مطرقة")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("تُعرض آخر بيانات محمّلة، ولم يكتمل تحديثها.")
  })

  it("disables duplicate retries while a failed background read retries, then clears the error on success", () => {
    const state = query({ data: { items: [] }, isError: true, isFetching: true })
    const { rerender } = render(view(state))
    const retry = screen.getByRole("button", { name: "جارٍ إعادة المحاولة..." }) as HTMLButtonElement
    expect(retry.disabled).toBe(true)
    fireEvent.click(retry)
    expect(state.refetch).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toBe("جارٍ إعادة المحاولة...")
    rerender(view(query({ data: { items: [] } })))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText("لا توجد عناصر")).toBeTruthy()
  })
})
