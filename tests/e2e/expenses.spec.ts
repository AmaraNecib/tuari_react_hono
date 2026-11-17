import { test } from "@playwright/test"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

// These legacy monetary flows are intentionally unavailable in the normal
// exact application. Assert the real UI and server boundary instead of cash CRUD.

test("expense creation remains unavailable without activating the numeric expense writer", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/expenses", capability: "expenses", procedure: "expensesCreate" })
})

test("expense voiding is not exposed by the current application contract", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/expenses", capability: "expenses", procedure: "expensesVoid" })
})
