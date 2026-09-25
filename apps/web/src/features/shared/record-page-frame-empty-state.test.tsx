// @vitest-environment jsdom

import "@/i18n"

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { workspaceRoutes } from "@/router/navigation"
import { RecordHistoryTable } from "./record-page-frame"

// RecordHistoryTable can render a WorkspaceLink CTA when `emptyAction` is set.
// The workspace-fixtures Link mock lives in the app-shell test utils; this
// file tests the shared primitive in isolation, so mock Link to expose the
// resolved route target as a real href (an <a> without href has no link role
// in jsdom) plus the raw target props for assertions.
const capturedTargets: Array<Record<string, unknown>> = []

function resolveHref(target: Record<string, unknown>): string {
  const to = String(target.to ?? "#")
  const params = (target.params ?? {}) as Record<string, string>
  return to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "")
}

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")
  return {
    ...actual,
    Link: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
      capturedTargets.push(props)
      return <a href={resolveHref(props)}>{children}</a>
    },
  }
})

afterEach(() => {
  cleanup()
  capturedTargets.length = 0
})

const EMPTY_ROW: Array<{
  id: string
  typeLabel: string
  title: string
  detail?: string | null
  periodLabel: string
  statusLabel: string
}> = []

describe("RecordHistoryTable empty-state guidance", () => {
  it("renders the hint and CTA link when the table is empty", () => {
    render(
      <RecordHistoryTable
        emptyLabel="لا يوجد سجل"
        emptyHint="يظهر السجل بعد إسناد العامل."
        emptyAction={{ label: "تعديل مكان العمل", target: workspaceRoutes.employeeEdit("employee-1") }}
        rows={EMPTY_ROW}
      />,
    )

    expect(screen.getByText("لا يوجد سجل")).toBeTruthy()
    expect(screen.getByText("يظهر السجل بعد إسناد العامل.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "تعديل مكان العمل" })).toBeTruthy()
  })

  it("points the CTA link at the requested workspace route", () => {
    render(
      <RecordHistoryTable
        emptyLabel="لا يوجد سجل"
        emptyAction={{ label: "إدارة العاملين", target: workspaceRoutes.employees() }}
        rows={EMPTY_ROW}
      />,
    )

    const cta = screen.getByRole("link", { name: "إدارة العاملين" }) as HTMLAnchorElement
    expect(cta.getAttribute("href")).toBe("/employees")
    expect(capturedTargets).toHaveLength(1)
    expect(capturedTargets[0]).toMatchObject({ to: "/employees" })
  })

  it("renders a hint without a CTA when only emptyHint is given", () => {
    render(<RecordHistoryTable emptyLabel="لا يوجد سجل" emptyHint="يظهر السجل بعد إسناد العامل." rows={EMPTY_ROW} />)

    expect(screen.getByText("يظهر السجل بعد إسناد العامل.")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("renders a CTA without a hint when only emptyAction is given", () => {
    render(
      <RecordHistoryTable
        emptyLabel="لا يوجد سجل"
        emptyAction={{ label: "إدارة العاملين", target: workspaceRoutes.employees() }}
        rows={EMPTY_ROW}
      />,
    )

    expect(screen.getByRole("link", { name: "إدارة العاملين" })).toBeTruthy()
  })

  it("resolves params into the CTA href for record routes", () => {
    render(
      <RecordHistoryTable
        emptyLabel="لا يوجد سجل"
        emptyAction={{ label: "تعديل مكان العمل", target: workspaceRoutes.employeeEdit("employee-7") }}
        rows={EMPTY_ROW}
      />,
    )

    const cta = screen.getByRole("link", { name: "تعديل مكان العمل" }) as HTMLAnchorElement
    expect(cta.getAttribute("href")).toBe("/employees/employee-7/edit")
    expect(capturedTargets).toHaveLength(1)
    expect(capturedTargets[0]).toMatchObject({
      to: "/employees/$employeeId/edit",
      params: { employeeId: "employee-7" },
    })
  })

  it("keeps the empty state label-only when no guidance props are given", () => {
    render(<RecordHistoryTable emptyLabel="لا يوجد سجل" rows={EMPTY_ROW} />)

    expect(screen.getByText("لا يوجد سجل")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("does not render hint or CTA when rows exist", () => {
    render(
      <RecordHistoryTable
        emptyLabel="لا يوجد سجل"
        emptyHint="يظهر السجل بعد إسناد العامل."
        emptyAction={{ label: "تعديل مكان العمل", target: workspaceRoutes.employeeEdit("employee-1") }}
        rows={[
          {
            id: "h1",
            typeLabel: "إسناد",
            title: "مشروع مبنى الإدارة",
            periodLabel: "2026-01-01",
            statusLabel: "نشط",
          },
        ]}
      />,
    )

    expect(screen.getByText("مشروع مبنى الإدارة")).toBeTruthy()
    expect(screen.queryByText("يظهر السجل بعد إسناد العامل.")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })
})