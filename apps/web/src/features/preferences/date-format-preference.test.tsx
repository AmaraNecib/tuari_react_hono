import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readDateFormat, setDateFormat, useDateFormat } from "./date-format-preference"

function Consumer() { return <output>{useDateFormat()}</output> }
function externalChange(value: string | null) {
  if (value === null) localStorage.removeItem("tuari.dateFormat")
  else localStorage.setItem("tuari.dateFormat", value)
  window.dispatchEvent(new StorageEvent("storage", { key: "tuari.dateFormat", storageArea: localStorage }))
}
beforeEach(() => { vi.restoreAllMocks(); externalChange(null) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); setDateFormat("DD/MM/YYYY"); externalChange(null) })

describe("local date format preference", () => {
  it("defaults safely, persists valid choices and refreshes mounted consumers", () => {
    render(<Consumer />)
    expect(screen.getByText("DD/MM/YYYY")).toBeTruthy()
    for (const order of ["MM/DD/YYYY", "YYYY/MM/DD", "YYYY/DD/MM", "DD/MM/YYYY"]) {
      act(() => setDateFormat(order))
      expect(screen.getByText(order)).toBeTruthy()
      expect(localStorage.getItem("tuari.dateFormat")).toBe(order)
    }
  })
  it("validates persisted and runtime choices", () => {
    externalChange("not-an-order")
    expect(readDateFormat()).toBe("DD/MM/YYYY")
    act(() => setDateFormat("malformed"))
    expect(readDateFormat()).toBe("DD/MM/YYYY")
  })
  it("adopts cross-tab updates and clearing without remounting", () => {
    render(<Consumer />)
    act(() => externalChange("YYYY/DD/MM"))
    expect(screen.getByText("YYYY/DD/MM")).toBeTruthy()
    act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage })) })
    expect(screen.getByText("DD/MM/YYYY")).toBeTruthy()
  })
  it("falls back when the storage getter is unavailable and retains the choice across remounts", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("unavailable") })
    render(<Consumer />)
    expect(screen.getByText("DD/MM/YYYY")).toBeTruthy()
    act(() => setDateFormat("YYYY/DD/MM"))
    cleanup()
    render(<Consumer />)
    expect(screen.getByText("YYYY/DD/MM")).toBeTruthy()
  })
  it("ignores storage events from sessionStorage", () => {
    render(<Consumer />)
    act(() => setDateFormat("YYYY/MM/DD"))
    localStorage.setItem("tuari.dateFormat", "MM/DD/YYYY")
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "tuari.dateFormat", storageArea: sessionStorage })))
    expect(screen.getByText("YYYY/MM/DD")).toBeTruthy()
  })
  it("keeps a usable session choice when storage reads and writes are denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied") })
    render(<Consumer />)
    expect(screen.getByText("DD/MM/YYYY")).toBeTruthy()
    act(() => setDateFormat("YYYY/MM/DD"))
    expect(screen.getByText("YYYY/MM/DD")).toBeTruthy()
  })
})
