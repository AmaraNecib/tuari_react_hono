// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShieldAlert } from "lucide-react"

import { LoadErrorSurface } from "../load-error-surface"

afterEach(() => {
  cleanup()
})

const RETRY_LABEL = "إعادة المحاولة"
const ERROR_MESSAGE = "تعذر تحميل بيانات الديون. حاول مرة أخرى."
const LOADING_LABEL = "جارٍ التحميل..."

describe("LoadErrorSurface (issue #38)", () => {
  it("renders the loading state with the loading label and no retry/alert", () => {
    render(
      <LoadErrorSurface
        isLoading
        loadingLabel={LOADING_LABEL}
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(LOADING_LABEL)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: RETRY_LABEL })).toBeNull()
    expect(screen.queryByText(ERROR_MESSAGE)).toBeNull()
  })

  it("renders the error state with icon, message and retry button by default", () => {
    const onRetry = vi.fn()
    render(
      <LoadErrorSurface
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(ERROR_MESSAGE)).toBeTruthy()
    expect(screen.getByRole("button", { name: RETRY_LABEL })).toBeTruthy()
    // Default destructive TriangleAlert icon renders an svg.
    expect(document.querySelector("svg")).toBeTruthy()
    // Loading state must not be present in the error branch.
    expect(screen.queryByText(LOADING_LABEL)).toBeNull()
  })

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn()
    render(
      <LoadErrorSurface
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: RETRY_LABEL }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("renders the optional slot content inside the error surface", () => {
    render(
      <LoadErrorSurface
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={vi.fn()}
      >
        <p>تفاصيل إضافية حول الخطأ.</p>
      </LoadErrorSurface>,
    )

    expect(screen.getByText("تفاصيل إضافية حول الخطأ.")).toBeTruthy()
    expect(screen.getByRole("alert")).toBeTruthy()
  })

  it("accepts custom props (icon, classes) without breaking the surface", () => {
    render(
      <LoadErrorSurface
        className="p-5"
        contentClassName="py-12"
        icon={ShieldAlert}
        iconClassName="h-12 w-12 text-muted-foreground"
        messageClassName="text-muted-foreground"
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(ERROR_MESSAGE)).toBeTruthy()
    expect(screen.getByRole("button", { name: RETRY_LABEL })).toBeTruthy()
    expect(document.querySelector("svg")).toBeTruthy()
  })

  it("defaults the error branch to the destructive border", () => {
    render(
      <LoadErrorSurface
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert").className).toContain("border-destructive/25")
  })

  it("lets errorClassName override the destructive border for the error branch", () => {
    render(
      <LoadErrorSurface
        className="p-5"
        errorClassName="border-line"
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={vi.fn()}
      />,
    )

    const alertClasses = screen.getByRole("alert").className
    expect(alertClasses).toContain("border-line")
    expect(alertClasses).not.toContain("border-destructive")
    // className-spacing still applies alongside the border override.
    expect(alertClasses).toContain("p-5")
  })

  it("renders the content slot bare when isError is explicitly false", () => {
    render(
      <LoadErrorSurface
        isError={false}
        message={ERROR_MESSAGE}
        retryLabel={RETRY_LABEL}
        onRetry={vi.fn()}
      >
        <div>محتوى الصفحة الفعلي</div>
      </LoadErrorSurface>,
    )

    expect(screen.getByText("محتوى الصفحة الفعلي")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: RETRY_LABEL })).toBeNull()
  })
})