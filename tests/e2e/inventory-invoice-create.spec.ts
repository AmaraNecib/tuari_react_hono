import { test } from "@playwright/test"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

// These legacy monetary flows are intentionally unavailable in the normal
// exact application. Assert the real UI and server boundary instead of cash CRUD.

test("invoice creation cannot invoke the legacy numeric inventory writer", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/invoices/create", capability: "invoices", procedure: "inventoryInvoiceGroupsCreate" })
})
