import { describe, expect, it, vi } from "vitest"

import { createWorkspaceNavigator, getWorkspaceLinkProps, parseEmployeeListRouteSearch, workspaceRoutes } from "./navigation"

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

  it("parses direct employee list URLs and keeps the page-one cursor sentinel", () => {
    expect(parseEmployeeListRouteSearch({ cursor: "page-2", limit: "20", prevCursors: "" })).toEqual({
      cursor: "page-2",
      limit: 20,
      prevCursors: "",
    })
    expect(parseEmployeeListRouteSearch({ cursor: "", limit: "1.5", prevCursors: 4 })).toEqual({ cursor: undefined, limit: undefined, prevCursors: undefined })
  })

  it("preserves employee cursor, limit, and previous-page state in route links", () => {
    expect(getWorkspaceLinkProps(workspaceRoutes.employees({ cursor: "page-2", limit: 20, prevCursors: "" }))).toEqual({
      to: "/employees",
      search: { cursor: "page-2", limit: 20, prevCursors: "" },
    })
  })

  it("builds link props from the same shared route wrapper", () => {
    expect(getWorkspaceLinkProps(workspaceRoutes.settings())).toEqual({
      to: "/settings",
    })
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
