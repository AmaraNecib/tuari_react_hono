import { expect, test, type Response } from "@playwright/test"

import { getApplicationUnavailableCopy } from "./helpers/application-unavailable-copy"
import { bootstrapOrSignIn } from "./helpers/session"

test.describe.configure({ mode: "serial" })

/** The exact dashboard must not fetch numeric financial or assignment families. */
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

test("the exact workspace loads only supported scoped lists and never the numeric snapshot", async ({ page }) => {
  const snapshotRequests: string[] = []
  const individualListRequests: string[] = []
  const capabilityResponses: Response[] = []
  page.on("response", response => {
    if (new URL(response.url()).pathname === "/rpc/applicationCapabilities" && response.request().method() === "POST") capabilityResponses.push(response)
  })

  // Register BEFORE navigation so the post-sign-in workspace fetch is counted.
  // Only POSTs are counted — an OPTIONS CORS preflight to the same URL (if the
  // browser ever issues one) must not inflate the snapshot count.
  page.on("request", (request) => {
    if (request.method() !== "POST") {
      return
    }
    const url = request.url()
    if (url.includes("/rpc/workspaceSnapshot")) {
      snapshotRequests.push(url)
    }
    if (INDIVIDUAL_LIST_RPCS.some((procedure) => url.includes(`/rpc/${procedure}`))) {
      individualListRequests.push(url)
    }
  })

  await bootstrapOrSignIn(page)

  // Dashboard counts appear only after the supported reference queries resolve.
  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()

  expect(capabilityResponses).toHaveLength(1)
  expect(capabilityResponses[0]!.ok()).toBe(true)
  const capabilities = await capabilityResponses[0]!.json()
  expect(capabilities.json).toMatchObject({ employees: "exact", approvedEarnings: "available", cashPayments: "unavailable", projectLaborCost: "exact-ledger" })
  expect(snapshotRequests).toEqual([])
  const procedures = individualListRequests.map(url => new URL(url).pathname.split("/").at(-1))
  expect(procedures.sort()).toEqual(["employeesList", "projectsList", "rolesList", "warehousesList"])
  await expect(page.getByText(getApplicationUnavailableCopy(), { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: /إضافة مشروع/ })).toBeVisible()
})
