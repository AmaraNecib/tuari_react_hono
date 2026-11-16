import { createORPCClient } from "@orpc/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { ApplicationCapabilities, ApplicationClient, ExactWorkforceEarningsClient } from "@tuari/contracts"
import { createWorkspaceRpcLink } from "@/lib/orpc-client"
import { i18n } from "@/i18n"
import { buildHomeViewCopy } from "./home-view-copy"
import { WorkspaceShell } from "./workspace-shell"

const captured = vi.hoisted(() => ({ client: null as ExactWorkforceEarningsClient | null }))
vi.mock("@/features/employees/exact-salary-earnings-section", () => ({
  ExactSalaryEarningsSection: ({ workforceClient }: { workforceClient: ExactWorkforceEarningsClient }) => {
    captured.client = workforceClient
    return <button onClick={() => { void workforceClient.listEmployeeEarnings({ employeeId: "worker-a" }); void workforceClient.getProjectSalaryCost({ projectId: "project-a" }) }}>Read earnings</button>
  },
}))
vi.mock("@/router/navigation", () => ({ WorkspaceLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); captured.client = null })

it("passes an inspectable facade to React and keeps real proxy business paths intact", async () => {
  const paths: string[] = []
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async input => {
    const path = new URL((input as Request).url).pathname
    paths.push(path)
    const json = path.endsWith("listEmployeeEarnings") ? [] : path.endsWith("getProjectSalaryCost")
      ? { projectId: "project-a", currency: "DZD", totalAmount: "25000.00", segments: [] }
      : { items: [] }
    return new Response(JSON.stringify({ json }), { headers: { "content-type": "application/json" } })
  }))
  const client = createORPCClient<ApplicationClient>(createWorkspaceRpcLink("rpc"))
  const capabilities: ApplicationCapabilities = {
    workspaceId: "11111111-1111-4111-8111-111111111111", employees: "exact", approvedEarnings: "available", projectLaborCost: "exact-ledger",
    cashPayments: "unavailable", advances: "unavailable", openings: "unavailable", corrections: "unavailable", invoices: "unavailable",
    inventoryMoney: "unavailable", expenses: "unavailable", monetaryReports: "unavailable", fullProjectCost: "unavailable",
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={query}><WorkspaceShell client={client} capabilities={capabilities} copy={buildHomeViewCopy(i18n.t)} page="salaries" session={{ id: "operator", name: "Operator", phone: "0555000001" } as never} theme="light" resetWorkspacePending={false} updateAccountPending={false} onResetWorkspace={vi.fn()} onSaveAccount={async () => undefined} onThemeToggle={vi.fn()} onUpdateApplied={vi.fn()} onPendingCommandChange={vi.fn()} /></QueryClientProvider>)
  await screen.findByRole("button", { name: "Read earnings" })
  // React tooling can inspect method names without traversing an RPC namespace.
  expect(typeof captured.client).toBe("object")
  expect(Object.values(captured.client!).every(method => typeof method.name === "string")).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Read earnings" }))
  await waitFor(() => expect(paths).toContain("/rpc/workforceExact/listEmployeeEarnings"))
  await waitFor(() => expect(paths).toContain("/rpc/workforceExact/getProjectSalaryCost"))
  expect(paths.filter(path => path.includes("/workforceExact/"))).toEqual([
    "/rpc/workforceExact/listEmployeeEarnings", "/rpc/workforceExact/getProjectSalaryCost",
  ])
})
