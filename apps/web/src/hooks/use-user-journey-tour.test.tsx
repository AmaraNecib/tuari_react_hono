// @vitest-environment jsdom
import "@/i18n"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { UserJourneyTour } from "./use-user-journey"

const STEPS = [
  { id: "sidebar", target: "[data-tour=sidebar]", title: "الشريط الجانبي", content: "استخدم الشريط الجانبي للتنقل" },
  { id: "search", target: "[data-tour=search]", title: "البحث", content: "اضغط Ctrl+K للبحث" },
]

afterEach(() => cleanup())

describe("UserJourneyTour", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders the children when the tour is not active", () => {
    render(
      <UserJourneyTour steps={STEPS} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )
    expect(screen.getByText("shell content")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("renders a labelled modal dialog when the tour is active", () => {
    localStorage.setItem("journey-home-tour-status", "active")
    render(
      <UserJourneyTour steps={STEPS} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )

    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("aria-labelledby")).toMatch(/^journey-title-home-tour$/)
    expect(screen.getByRole("heading", { name: "الشريط الجانبي" })).toBeTruthy()
    expect(screen.getByText("1 من 2")).toBeTruthy()
  })

  it("advances to the next step with the Next button", () => {
    localStorage.setItem("journey-home-tour-status", "active")
    render(
      <UserJourneyTour steps={STEPS} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByRole("heading", { name: "البحث" })).toBeTruthy()
    expect(screen.getByText("2 من 2")).toBeTruthy()
  })

  it("skips the tour via the Skip button and persists the status", () => {
    localStorage.setItem("journey-home-tour-status", "active")
    render(
      <UserJourneyTour steps={STEPS} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )

    fireEvent.click(screen.getByRole("button", { name: "تخطي" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(localStorage.getItem("journey-home-tour-status")).toBe("skipped")
  })

  it("skips the tour on Escape (same as the Skip button)", () => {
    localStorage.setItem("journey-home-tour-status", "active")
    render(
      <UserJourneyTour steps={STEPS} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(localStorage.getItem("journey-home-tour-status")).toBe("skipped")
  })

  it("does not strand the journey when active with no steps", () => {
    localStorage.setItem("journey-home-tour-status", "active")
    render(
      <UserJourneyTour steps={[]} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )

    // No dialog to dismiss, and the persisted status is not left active.
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(localStorage.getItem("journey-home-tour-status")).toBe("skipped")
  })

  it("completes the tour on the last step", () => {
    localStorage.setItem("journey-home-tour-status", "active")
    const single = [STEPS[0]!]
    render(
      <UserJourneyTour steps={single} storageKey="home-tour">
        <div>shell content</div>
      </UserJourneyTour>
    )

    fireEvent.click(screen.getByRole("button", { name: "تم" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(localStorage.getItem("journey-home-tour-status")).toBe("completed")
  })
})
