import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

vi.mock("@/lib/app-ready", () => ({
  notifyAppReady: vi.fn(),
}))

import { notifyAppReady } from "@/lib/app-ready"
import { useNotifyAppReady } from "./use-notify-app-ready"

const notifyAppReadyMock = vi.mocked(notifyAppReady)

describe("useNotifyAppReady", () => {
  beforeEach(() => {
    notifyAppReadyMock.mockReset()
    notifyAppReadyMock.mockResolvedValue(undefined)
  })

  it("does nothing while ready stays false", () => {
    const { rerender } = renderHook(({ ready }) => useNotifyAppReady(ready), {
      initialProps: { ready: false },
    })

    rerender({ ready: false })

    expect(notifyAppReadyMock).not.toHaveBeenCalled()
  })

  it("fires exactly once when ready becomes true", () => {
    const { rerender } = renderHook(({ ready }) => useNotifyAppReady(ready), {
      initialProps: { ready: false },
    })

    rerender({ ready: true })
    rerender({ ready: true })

    expect(notifyAppReadyMock).toHaveBeenCalledTimes(1)
  })

  it("does not re-fire after ready toggles back and forth", () => {
    const { rerender } = renderHook(({ ready }) => useNotifyAppReady(ready), {
      initialProps: { ready: false },
    })

    rerender({ ready: true })
    rerender({ ready: false })
    rerender({ ready: true })

    expect(notifyAppReadyMock).toHaveBeenCalledTimes(1)
  })
})
