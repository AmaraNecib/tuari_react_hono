// @vitest-environment jsdom
import { createElement, type ReactNode } from "react"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ORPCError } from "@orpc/client"
import { expect, it, vi } from "vitest"
import { useCreateProjectMutation } from "./workspace-mutations"
const mocks = vi.hoisted(() => ({ create: vi.fn(), errorToast: vi.fn() }))
vi.mock("@/lib/orpc-client", async () => ({ ...await vi.importActual<typeof import("@/lib/orpc-client")>("@/lib/orpc-client"), rpcClient: { projectsCreate: mocks.create } }))
vi.mock("@/lib/toast", () => ({ showErrorToast: mocks.errorToast, showSuccessToast: vi.fn() }))

it("shows the wire field validation message rather than generic ORPC text", async () => {
  const error = new ORPCError("BAD_REQUEST", { message: "Input validation failed", data: { issues: [{ path: ["name"], message: "Project name must contain at most 160 characters" }] } })
  mocks.create.mockRejectedValueOnce(error)
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  const { result, unmount } = renderHook(() => useCreateProjectMutation(), { wrapper })
  await expect(result.current.mutateAsync({ name: "x".repeat(161) })).rejects.toBe(error)
  expect(mocks.errorToast).toHaveBeenCalledWith("Project name must contain at most 160 characters")
  expect(mocks.errorToast).not.toHaveBeenCalledWith("Input validation failed")
  unmount()
  client.clear()
})
