import "@/i18n"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { setDateFormat } from "@/features/preferences/date-format-preference"
import { DateFormatSetting } from "@/features/preferences/date-format-setting"
import { AppDate } from "./app-date"

afterEach(() => { cleanup(); setDateFormat("DD/MM/YYYY") })

describe("date preference rendering", () => {
  it("isolates the numeric run and updates mounted date and timestamp from the real setting", () => {
    render(<div dir="rtl"><DateFormatSetting /><p>تاريخ <AppDate value="2026-11-10T23:30:00Z" /></p><AppDate value="2026-11-10T23:30:00Z" includeTime /></div>)
    expect(screen.getAllByText("11/11/2026")).toHaveLength(2)
    for (const date of screen.getAllByText("11/11/2026")) {
      expect(date.tagName).toBe("BDI")
      expect(date.getAttribute("dir")).toBe("ltr")
    }
    fireEvent.change(screen.getByRole("combobox", { name: "تنسيق التاريخ" }), { target: { value: "YYYY/DD/MM" } })
    expect(screen.getAllByText("2026/11/11")).toHaveLength(2)
    expect(screen.getByText("2026/23/04")).toBeTruthy()
    expect(screen.getByText("12:30 ص")).toBeTruthy()
  })
  it("preserves the placeholder and supports an explicit locale without adding a language", () => {
    render(<><AppDate value="not-a-date" /><AppDate value="2026-04-23" locale="en-US" /></>)
    expect(screen.getByText("—")).toBeTruthy()
    expect(screen.getByText("23/04/2026")).toBeTruthy()
    act(() => setDateFormat("MM/DD/YYYY"))
    expect(screen.getByText("04/23/2026")).toBeTruthy()
  })
})
