import { test } from "@playwright/test"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

// These legacy monetary flows are intentionally unavailable in the normal
// exact application. Assert the real UI and server boundary instead of cash CRUD.

test("invoice payment stays behind the explicit unavailable capability", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/invoices", capability: "invoices", procedure: "inventoryInvoiceGroupsRecordPayment" })
})
