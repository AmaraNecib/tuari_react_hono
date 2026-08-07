import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

test.describe.configure({ mode: "serial" })

/**
 * The list endpoints the shell used to fan out to individually (issue #276).
 * After the refactor the workspace composite must fetch ONLY the single
 * `workspaceSnapshot` RPC; these must not fire on a plain dashboard load
 * (global search is closed, system log is gated behind the transactions page).
 */
const INDIVIDUAL_LIST_RPCS = [
  "rbacRolesList",
  "rolesList",
  "employeesList",
  "projectsList",
  "warehousesList",
  "externalCounterpartiesList",
  "managerAssignmentsList",
  "projectAssignmentsList",
  "warehouseAssignmentsList",
  "salaryPaymentsList",
  "employeeStateHistoryList",
  "projectManagerOwnershipHistoryList",
  "warehouseManagerOwnershipHistoryList",
]

test("the workspace shell loads via a single workspaceSnapshot RPC (issue #276)", async ({ page }) => {
  const snapshotRequests: string[] = []
  const individualListRequests: string[] = []

  // Register BEFORE navigation so the post-sign-in workspace fetch is counted.
  page.on("request", (request) => {
    const url = request.url()
    if (url.includes("/rpc/workspaceSnapshot")) {
      snapshotRequests.push(url)
    }
    if (INDIVIDUAL_LIST_RPCS.some((procedure) => url.includes(`/rpc/${procedure}`))) {
      individualListRequests.push(url)
    }
  })

  await bootstrapOrSignIn(page)

  // The dashboard heading only renders once the workspace snapshot resolved
  // (the shell shows a loading state until the composite data is non-null),
  // so the request counts are stable by this point.
  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()

  expect(snapshotRequests).toHaveLength(1)
  expect(individualListRequests).toEqual([])
})
