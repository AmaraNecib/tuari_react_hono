// @vitest-environment jsdom

/**
 * Issue #27 — empty states teach the next action.
 *
 * Integration coverage through the workspace harness (renderWorkspace):
 * each key empty state renders a one-line hint + a working CTA link, and a
 * populated state stays unchanged (rows, no guidance). Playwright is owned by
 * lane #25 this round, so navigation correctness is covered here via the
 * link target (unit: record-page-frame-empty-state.test.tsx) and presence.
 */

import { cleanup, configure, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  demoUser,
  makeWorkspaceData,
  renderWorkspace,
} from "./__test-utils__/workspace-fixtures"

// The shell fires the Tauri splashscreen-ready signal on first data load;
// keep the harness offline like the rest of the home-view suite.
vi.mock("@/hooks/use-notify-app-ready", () => ({
  useNotifyAppReady: vi.fn(),
}))

// Lazy detail pages are load-sensitive (issue #219/#286): raise the async
// wait and suite timeout like the rest of the home-view suite.
configure({ asyncUtilTimeout: 20000 })
vi.setConfig({ testTimeout: 60000 })

const PROJECT_WORKERS_HINT = "يمكن إسناد العمال من ملف كل عامل عبر اختيار مكان العمل."
const WAREHOUSE_TEAM_HINT = "يمكن إسناد الأعضاء من ملف كل موظف عبر اختيار مكان العمل."
const WORK_HISTORY_HINT = "يظهر السجل هنا بعد إسناد العامل إلى مشروع أو مستودع."
const ITEM_DEFINITIONS_HINT = "أنشئ أول تعريف ليصبح العنصر متاحًا داخل الفواتير والتحويلات."
const MANAGE_WORKERS_CTA = "إدارة العاملين"
const EDIT_WORKPLACE_CTA = "تعديل مكان العمل"

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("journey-home-tour-status", "skipped")
  document.documentElement.className = ""
  document.documentElement.lang = "ar"
  document.documentElement.dir = "rtl"
})

afterEach(() => {
  cleanup()
})

function expectAnchorContaining(text: string) {
  const node = screen.getByText(text)
  return expect(node.closest("a")).not.toBeNull()
}

describe("project-details workers tab empty state (issue #27)", () => {
  it("renders a hint and a manage-workers CTA when no workers are assigned", async () => {
    renderWorkspace("project-details", {
      sessionUser: demoUser,
      projectId: "project-1",
      detailTab: "workers",
      workspaceData: makeWorkspaceData({ projectAssignments: [] }),
    })

    expect(await screen.findByText(PROJECT_WORKERS_HINT)).toBeTruthy()
    expectAnchorContaining(MANAGE_WORKERS_CTA)
  })

  it("keeps the populated tab rendering rows without guidance", async () => {
    renderWorkspace("project-details", {
      sessionUser: demoUser,
      projectId: "project-1",
      detailTab: "workers",
    })

    expect(await screen.findByText("علي بن حميد")).toBeTruthy()
    expect(screen.queryByText(PROJECT_WORKERS_HINT)).toBeNull()
    expect(screen.queryByText(MANAGE_WORKERS_CTA)).toBeNull()
  })
})

describe("warehouse-details team tab empty state (issue #27)", () => {
  it("renders a hint and a manage-workers CTA when the team is empty", async () => {
    renderWorkspace("warehouse-details", {
      sessionUser: demoUser,
      warehouseId: "warehouse-1",
      detailTab: "team",
    })

    expect(await screen.findByText(WAREHOUSE_TEAM_HINT)).toBeTruthy()
    expectAnchorContaining(MANAGE_WORKERS_CTA)
  })
})

describe("employee work-history tab empty state (issue #27)", () => {
  it("renders a hint and an edit-workplace CTA when the history is empty", async () => {
    renderWorkspace("employee-details", {
      sessionUser: demoUser,
      employeeId: "employee-worker-1",
      detailTab: "history",
      workspaceData: makeWorkspaceData({
        employeeStateHistory: [],
        managerAssignments: [],
        projectAssignments: [],
        warehouseAssignments: [],
      }),
    })

    expect(await screen.findByText(WORK_HISTORY_HINT)).toBeTruthy()
    expectAnchorContaining(EDIT_WORKPLACE_CTA)
  })

  it("keeps the populated history rendering rows without guidance", async () => {
    renderWorkspace("employee-details", {
      sessionUser: demoUser,
      employeeId: "employee-worker-1",
      detailTab: "history",
    })

    // Default data assigns employee-worker-1 to a manager and a project.
    expect(await screen.findByText("مبنى الإدارة الجديد")).toBeTruthy()
    expect(screen.getByText("أحمد بلخير")).toBeTruthy()
    expect(screen.queryByText(WORK_HISTORY_HINT)).toBeNull()
    expect(screen.queryByText(EDIT_WORKPLACE_CTA)).toBeNull()
  })

  it("keeps non-workers' empty history label-only (no assignment CTA)", async () => {
    renderWorkspace("employee-details", {
      sessionUser: demoUser,
      employeeId: "employee-manager-1",
      detailTab: "history",
    })

    // The manager has no work history rows by default, and the workplace
    // placement surface is worker-only, so the guidance must not render.
    expect(await screen.findByText("لا يوجد سجل عمل بعد.")).toBeTruthy()
    expect(screen.queryByText(WORK_HISTORY_HINT)).toBeNull()
    expect(screen.queryByText(EDIT_WORKPLACE_CTA)).toBeNull()
  })

  it.each(["INACTIVE", "LEFT"] as const)(
    "keeps a non-active worker's empty history label-only (status %s)",
    async (nonActiveStatus: "INACTIVE" | "LEFT") => {
      renderWorkspace("employee-details", {
        sessionUser: demoUser,
        employeeId: "employee-worker-1",
        detailTab: "history",
        workspaceData: makeWorkspaceData({
          employees: makeWorkspaceData().employees.map((employee) =>
            employee.id === "employee-worker-1" ? { ...employee, status: nonActiveStatus } : employee,
          ),
          employeeStateHistory: [],
          managerAssignments: [],
          projectAssignments: [],
          warehouseAssignments: [],
        }),
      })

      // Non-active workers cannot be placed via the #20 edit flow (it only
      // persists for ACTIVE workers), so the CTA would be a silent dead-end.
      expect(await screen.findByText("لا يوجد سجل عمل بعد.")).toBeTruthy()
      expect(screen.queryByText(WORK_HISTORY_HINT)).toBeNull()
      expect(screen.queryByText(EDIT_WORKPLACE_CTA)).toBeNull()
    },
  )
})

describe("items catalog empty state (issue #27)", () => {
  it("renders a one-line hint above the existing create CTA", async () => {
    renderWorkspace("inventory", { sessionUser: demoUser })

    expect(await screen.findByText(ITEM_DEFINITIONS_HINT)).toBeTruthy()
    // The catalog empty state reuses the same create button as the form;
    // both must be reachable.
    expect(screen.getAllByRole("button", { name: "إنشاء التعريف" }).length).toBeGreaterThanOrEqual(1)
  })
})