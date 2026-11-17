import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { ExactWorkforceEarningsClient } from "@tuari/contracts"
import { ExactProjectSalaryCost } from "./exact-project-salary-cost"
import "@/i18n"
afterEach(cleanup)
it("shares the approval invalidation scope and isolates another operator's ledger cache", async () => {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 30_000 } } })
  const projectId = "4c446693-786b-4b83-a73c-29651734043e"
  query.setQueryData(["workspace", "workspace-a", "user-a", "exact-workforce", "project", projectId], { projectId, currency: "DZD", totalAmount: "25000.00", segments: [] })
  const getProjectSalaryCost = vi.fn(async () => ({ projectId, currency: "DZD", totalAmount: "37500.00", segments: [{ earningId: "earning", employeeId: "worker", periodStart: "2026-11-01", periodEnd: "2026-11-30", segment: { id: "segment", projectId, amount: "37500.00" } }] }))
  const client = { getProjectSalaryCost } as unknown as ExactWorkforceEarningsClient
  const view = (userId: string) => <QueryClientProvider client={query}><ExactProjectSalaryCost projectId={projectId} client={client} scope={{ workspaceId: "workspace-a", userId }} /></QueryClientProvider>
  const mounted = render(view("user-a"))
  await screen.findByText("25,000")
  expect(getProjectSalaryCost).not.toHaveBeenCalled()
  await query.invalidateQueries({ queryKey: ["workspace", "workspace-a", "user-a", "exact-workforce"] })
  await screen.findByText("37,500")
  mounted.rerender(view("user-b"))
  await waitFor(() => expect(getProjectSalaryCost).toHaveBeenCalledTimes(2))
})
