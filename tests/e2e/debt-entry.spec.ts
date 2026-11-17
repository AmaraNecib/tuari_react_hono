import { test } from "@playwright/test"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

// These legacy monetary flows are intentionally unavailable in the normal
// exact application. Assert the real UI and server boundary instead of cash CRUD.

test("debt account creation remains unavailable in the exact workspace", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/debts/create", capability: "monetaryReports", procedure: "debtAccountsCreate" })
})

test("numeric debt payment cannot be reached from the debts page", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/debts", capability: "monetaryReports", procedure: "debtEntriesRecordPayment" })
})
