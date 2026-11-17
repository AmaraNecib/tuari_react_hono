import { test } from "@playwright/test"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

// These legacy monetary flows are intentionally unavailable in the normal
// exact application. Assert the real UI and server boundary instead of cash CRUD.

test("asset transfers do not reactivate numeric project charges", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/inventory", capability: "fullProjectCost", procedure: "inventoryAssetsTransfer" })
})

test("past asset-charge corrections remain unavailable", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/inventory", capability: "fullProjectCost", procedure: "inventoryAssetChargesUpdate" })
})
