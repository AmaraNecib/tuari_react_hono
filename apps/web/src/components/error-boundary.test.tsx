// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErrorBoundary } from "./error-boundary"

const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message)
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>Success</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText("Success")).toBeTruthy()
  })

  it("renders default fallback when child component throws error", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Test error" />
      </ErrorBoundary>,
    )

    const fallback = screen.queryAllByText("حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة.")
    expect(fallback.length).toBeGreaterThan(0)
  })

  it("renders custom fallback when provided and error occurs", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error Message</div>}>
        <ThrowError message="Test error" />
      </ErrorBoundary>,
    )

    expect(screen.getByText("Custom Error Message")).toBeTruthy()
  })

  it("logs error to console when error is caught", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError message="Test error message" />
      </ErrorBoundary>,
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ErrorBoundary]",
      "Test error message",
      expect.any(String),
    )
  })

  it("displays fallback with RTL direction", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowError message="Test error" />
      </ErrorBoundary>,
    )

    const fallbackDiv = container.querySelector("[dir='rtl']")
    expect(fallbackDiv).toBeTruthy()
  })

  it("has correct styling classes on error fallback", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowError message="Test error" />
      </ErrorBoundary>,
    )

    const fallbackDiv = container.querySelector(".flex")
    expect(fallbackDiv).toBeTruthy()
  })
})
