import { describe, expect, it, vi } from "vitest"

import { createWorkspaceNavigator, getWorkspaceLinkProps, workspaceRoutes } from "./navigation"

describe("workspace navigation helpers", () => {
  it("forwards typed workspace targets through the shared navigator", () => {
    const navigate = vi.fn()
    const goToRoute = createWorkspaceNavigator(navigate)

    goToRoute(workspaceRoutes.employeeTab("employee-1", "finance"))

    expect(navigate).toHaveBeenCalledWith({
      to: "/employees/$employeeId",
      params: { employeeId: "employee-1" },
      search: { tab: "finance" },
    })
  })

  it("builds link props from the same shared route wrapper", () => {
    expect(getWorkspaceLinkProps(workspaceRoutes.settings())).toEqual({
      to: "/settings",
    })
  })

  it("builds earned-wage approval and salaries return targets", () => {
    expect(getWorkspaceLinkProps(workspaceRoutes.employeeEarningCreate("worker-1", "salaries"))).toEqual({
      params: { employeeId: "worker-1" },
      search: { returnTo: "salaries" },
      to: "/employees/$employeeId/earnings/new",
    })
    expect(getWorkspaceLinkProps(workspaceRoutes.salaries())).toEqual({ to: "/salaries" })
    expect(getWorkspaceLinkProps(workspaceRoutes.salaryEarnings())).toEqual({ to: "/salaries", search: { tab: "earnings", page: 1, pageSize: 10 } })
    expect(getWorkspaceLinkProps(workspaceRoutes.salaryWorkers())).toEqual({ to: "/salaries", search: { tab: "workers", page: 1, pageSize: 10 } })
  })

  it("supports dedicated create pages for projects and warehouses", () => {
    expect(getWorkspaceLinkProps(workspaceRoutes.projectCreate())).toEqual({
      to: "/projects/create",
    })
    expect(getWorkspaceLinkProps(workspaceRoutes.warehouseCreate())).toEqual({
      to: "/warehouses/create",
    })
  })

  it("supports debts hub and external counterparty routes", () => {
    expect(getWorkspaceLinkProps(workspaceRoutes.debts())).toEqual({
      to: "/debts",
    })
    expect(getWorkspaceLinkProps(workspaceRoutes.externalCreate())).toEqual({
      to: "/externals/create",
    })
    expect(getWorkspaceLinkProps(workspaceRoutes.externalDetails("external-1"))).toEqual({
      params: { externalId: "external-1" },
      to: "/externals/$externalId",
    })
  })
})
