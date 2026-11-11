// @vitest-environment jsdom
import "@/i18n"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"

import { UserJourneyTour, useUserJourney } from "./use-user-journey"

const STEPS = [
  { id: "sidebar", target: "[data-tour=sidebar]", title: "الشريط الجانبي", content: "استخدم الشريط الجانبي للتنقل" },
  { id: "search", target: "[data-tour=search]", title: "البحث", content: "اضغط Ctrl+K للبحث" },
]

const networkRequest = vi.fn(() => Promise.reject(new Error("Onboarding must stay local")))

beforeEach(() => {
  networkRequest.mockClear()
  vi.stubGlobal("fetch", networkRequest)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  expect(networkRequest).not.toHaveBeenCalled()
})

describe("UserJourneyTour", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("persists journey progress and level locally across remounts", () => {
    sessionStorage.clear()
    const { result, unmount } = renderHook(() => useUserJourney({ key: "home-tour" }))
    act(() => result.current.start())
    act(() => result.current.advance())
    expect(localStorage.getItem("journey-home-tour-status")).toBe("active")
    expect(localStorage.getItem("journey-home-tour-step")).toBe("1")
    act(() => result.current.complete())
    expect(localStorage.getItem("journey-home-tour-status")).toBe("completed")
    expect(localStorage.getItem("user-onboarding-level")).toBe("2")
    unmount()

    const restored = renderHook(() => useUserJourney({ key: "home-tour" }))
    expect(restored.result.current.isCompleted).toBe(true)
    expect(restored.result.current.state.currentStep).toBe(1)
    expect(restored.result.current.state.level).toBe(2)
    expect(sessionStorage.getItem("analytics-session-id")).toBeNull()
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
