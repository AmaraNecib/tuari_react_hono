// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { useQuery } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { orpc } from "@/lib/orpc-client"
import { useSessionQuery } from "./use-session-query"

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  )

  return {
    ...actual,
    useQuery: vi.fn(),
  }
})

vi.mock("@/lib/orpc-client", () => ({
  orpc: {
    session: {
      queryOptions: vi.fn(),
    },
  },
}))

describe("useSessionQuery", () => {
  beforeEach(() => {
    vi.mocked(orpc.session.queryOptions).mockReset()
    vi.mocked(useQuery).mockReset()
  })

  it("delegates to the shared oRPC TanStack Query options", () => {
    const queryOptions = {
      queryKey: [["session"]],
      queryFn: vi.fn(),
    }
    vi.mocked(orpc.session.queryOptions).mockReturnValue(queryOptions as never)
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
    } as never)

    renderHook(() => useSessionQuery())

    expect(orpc.session.queryOptions).toHaveBeenCalledTimes(1)
    expect(useQuery).toHaveBeenCalledWith(queryOptions)
  })
})
