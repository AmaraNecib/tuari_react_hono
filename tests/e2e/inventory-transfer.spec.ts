import { test } from "@playwright/test"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

// These legacy monetary flows are intentionally unavailable in the normal
// exact application. Assert the real UI and server boundary instead of cash CRUD.

test("consumable transfers remain unavailable without issuing a numeric transfer", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/inventory", capability: "inventoryMoney", procedure: "inventoryConsumablesTransfer" })
})

test("outbound transfer creation remains unavailable in the normal root", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/outbound-transfers/create", capability: "inventoryMoney", procedure: "inventoryOutboundTransfersCreate" })
})
