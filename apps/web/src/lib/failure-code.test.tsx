// @vitest-environment jsdom
import { StrictMode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { renderToString } from "react-dom/server"
const calls = vi.hoisted(() => ({ record: vi.fn(), create: vi.fn() }))
vi.mock("./error-correlation", () => ({ createErrorId: calls.create, recordUiFailure: calls.record, formatErrorCode: (id: number) => `TUARI-${id}` }))
import { FailureCode } from "./failure-code"
afterEach(() => { cleanup(); vi.clearAllMocks() })
it("records only a committed visible failure, once across StrictMode and duplicate displays", () => {
  calls.create.mockReturnValue(12)
  const error = new Error("secret transport text")
  expect(renderToString(<FailureCode error={error} />)).toBe("")
  expect(calls.record).not.toHaveBeenCalled()
  render(<StrictMode><FailureCode error={error} /><FailureCode error={error} /></StrictMode>)
  expect(screen.getAllByText("TUARI-12")).toHaveLength(2)
  expect(calls.record).toHaveBeenCalledExactlyOnceWith(12)
  expect(screen.queryByText("secret transport text")).toBeNull()
  expect(screen.getAllByText("TUARI-12")[0]?.getAttribute("dir")).toBe("ltr")
})
it("keeps a failure stable across rerenders and remounts but assigns a new code to a new attempt", () => {
  calls.create.mockReturnValueOnce(20).mockReturnValueOnce(21).mockReturnValueOnce(22)
  const error = new Error("failed")
  const view = render(<FailureCode error={error} attempt={1} />)
  view.rerender(<FailureCode error={error} attempt={1} />)
  expect(calls.record).toHaveBeenCalledTimes(1)
  view.unmount()
  const retry = render(<FailureCode error={error} attempt={1} />)
  expect(screen.getByText("TUARI-20")).toBeTruthy()
  expect(calls.record).toHaveBeenCalledTimes(1)
  retry.rerender(<FailureCode error={null} />)
  expect(screen.queryByText("TUARI-20")).toBeNull()
  retry.rerender(<FailureCode error={error} attempt={2} />)
  expect(screen.getByText("TUARI-21")).toBeTruthy()
  retry.rerender(<FailureCode error={new Error("new failure")} attempt={2} />)
  expect(screen.getByText("TUARI-22")).toBeTruthy()
  expect(calls.record).toHaveBeenCalledTimes(3)
})
