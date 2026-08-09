import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useDebouncedValue } from "./use-debounced-value"

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("init", 175))
    expect(result.current).toBe("init")
  })

  it("does not emit the new value before the delay elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 175), {
      initialProps: { value: "a" },
    })

    rerender({ value: "b" })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toBe("a")
  })

  it("emits the new value after the delay elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 175), {
      initialProps: { value: "a" },
    })

    rerender({ value: "b" })
    act(() => {
      vi.advanceTimersByTime(175)
    })

    expect(result.current).toBe("b")
  })

  it("restarts the timer on each rapid change (trailing-edge debounce)", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 175), {
      initialProps: { value: "" },
    })

    rerender({ value: "b" })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ value: "bc" })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ value: "bcd" })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Only 300ms since the first change, 100ms since the last — nothing emitted.
    expect(result.current).toBe("")

    act(() => {
      vi.advanceTimersByTime(75)
    })
    // 175ms of silence after the LAST change ("bcd") — emitted now.
    expect(result.current).toBe("bcd")
  })

  it("clears the pending timer on unmount", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 175),
      { initialProps: { value: "a" } },
    )

    rerender({ value: "b" })
    unmount()

    act(() => {
      vi.advanceTimersByTime(175)
    })

    // No state update after unmount — the hook simply never fires.
    expect(result.current).toBe("a")
  })

  it("supports non-string values (empty-string reset flows)", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 175), {
      initialProps: { value: "query" as string | null },
    })

    rerender({ value: null })
    act(() => {
      vi.advanceTimersByTime(175)
    })

    expect(result.current).toBeNull()
  })

  it("flushes the current value synchronously when the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ value, open }) => useDebouncedValue(value, 175, open),
      { initialProps: { value: "مبنى", open: false } },
    )

    // Settle the old query.
    act(() => {
      vi.advanceTimersByTime(175)
    })
    expect(result.current).toBe("مبنى")

    // Rapid reopen: the reset signal flips and the stale value is dropped
    // immediately — no 175ms window where the old query can surface again.
    rerender({ value: "", open: true })
    expect(result.current).toBe("")

    // No pending timer resurrects the old value.
    act(() => {
      vi.advanceTimersByTime(175)
    })
    expect(result.current).toBe("")
  })
})
