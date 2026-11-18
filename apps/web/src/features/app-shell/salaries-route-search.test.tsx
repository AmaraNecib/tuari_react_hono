// @vitest-environment jsdom

import "@/i18n"

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SalariesSection } from "./salaries-section"
import { parseSalariesSearch, patchSalariesSearch, type SalariesRouteSearch } from "./salaries-route-search"

const projects = [{ id: "project-1", name: "مشروع" }]
const workers = [{
  employeeId: "worker-1", employeeName: "العامل", employeePhone: "0555000001", employeeRole: "عامل",
  salaryReference: { period: "MONTHLY" as const, amount: "30000.00" }, lastPaymentDate: null,
  projectAssignments: [],
}]
const payments = Array.from({ length: 25 }, (_, index) => ({
  id: `payment-${index + 1}`,
  employeeId: "worker-1",
  employeeName: `العامل ${index + 1}`,
  employeePhone: "0555000001",
  employeeRole: "عامل",
  paymentDate: "2026-03-31T00:00:00.000Z",
  days: 1,
  expectedAmountDzd: 100,
  actualAmountDzd: 100,
  projectSplits: [],
  note: null,
}))

afterEach(cleanup)

function clickNextPage(pageStatus: string) {
  const status = screen.getByText(pageStatus)
  const controls = status.parentElement
  if (!controls) throw new Error(`Missing pagination controls for ${pageStatus}`)
  fireEvent.click(within(controls).getAllByRole("button")[1]!)
}

function getPageSizeSelect() {
  return (screen.getAllByRole("combobox") as HTMLSelectElement[]).find(
    (select) => Array.from(select.options).map((option) => option.value).join(",") === "10,25,50,100",
  )
}

describe("salaries route search", () => {
  it("restores direct and reloaded URLs with safe defaults and unrelated keys", () => {
    expect(parseSalariesSearch({ tab: "earnings", page: "3", pageSize: "25", keep: "filter-token" }))
      .toEqual({ tab: "earnings", page: 3, pageSize: 25, keep: "filter-token" })
    expect(parseSalariesSearch({ tab: "cash", page: "0", pageSize: "17", keep: "yes" }))
      .toEqual({ tab: "recent", page: 1, pageSize: 10, keep: "yes" })
    for (const page of ["2.5", "not-a-page", "9007199254740992"]) {
      expect(parseSalariesSearch({ page }).page).toBe(1)
    }
  })

  it("records tab and pagination changes in history and restores them with back/forward", async () => {
    const { router } = renderSalariesRoute("/salaries?tab=recent&page=1&pageSize=10&keep=source")
    await screen.findAllByText("العامل 1")

    clickNextPage("1 / 3")
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "recent", page: 2, keep: "source" }))
    expect(screen.getAllByText("العامل 11")).toBeTruthy()

    await act(async () => { router.history.back() })
    await waitFor(() => expect(router.state.location.search.page).toBe(1))
    expect(screen.getAllByText("العامل 1")).toBeTruthy()

    await act(async () => { router.history.forward() })
    await waitFor(() => expect(router.state.location.search.page).toBe(2))
    expect(screen.getAllByText("العامل 11")).toBeTruthy()

    fireEvent.click(screen.getAllByRole("tab")[1]!)
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "workers", page: 1, pageSize: 10, keep: "source" }))
  })

  it("resets the URL page when a filter or page size changes", async () => {
    const { router } = renderSalariesRoute("/salaries?tab=recent&page=2&pageSize=10&keep=source")
    await screen.findAllByText("العامل 11")

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "missing worker" } })
    await waitFor(() => expect(router.state.location.search.page).toBe(1))
    expect(router.state.location.search.keep).toBe("source")

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } })
    await screen.findAllByText("العامل 1")
    clickNextPage("1 / 3")
    await waitFor(() => expect(router.state.location.search.page).toBe(2))
    fireEvent.change(getPageSizeSelect()!, { target: { value: "25" } })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: 1, pageSize: 25, keep: "source" }))
  })
})

function renderSalariesRoute(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet })
  function SalariesRouteHarness() {
    const search = salariesRoute.useSearch() as SalariesRouteSearch
    const navigate = salariesRoute.useNavigate()
    return (
      <SalariesSection
        recentPayments={payments}
        workers={workers}
        employees={[]}
        projects={projects}
        routeSearch={search}
        onRouteSearchChange={(patch) => void navigate({ search: (previous: SalariesRouteSearch) => patchSalariesSearch(previous, patch) } as never)}
        onAddPayment={vi.fn()}
        onEditSalary={vi.fn()}
      />
    )
  }
  const salariesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/salaries",
    validateSearch: parseSalariesSearch,
    component: SalariesRouteHarness,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([salariesRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  render(<RouterProvider router={router} />)
  return { router }
}
