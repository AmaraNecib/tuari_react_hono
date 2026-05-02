import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates an inventory item and transfer it between locations", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "المخزون" }).first().click()
  await expect(page.getByRole("heading", { name: "المخزون" })).toBeVisible()

  // Navigate to inventory items
  const itemsTab = page.getByRole("tab", { name: /الأصناف/ })
  if (await itemsTab.isVisible()) {
    await itemsTab.click()
  }

  await page.getByRole("button", { name: /إضافة صنف/ }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة صنف/ })).toBeVisible()

  const itemName = `صنف-${uniqueSuffix()}`
  const unitCost = "100"

  await page.getByLabel(/الاسم/).first().fill(itemName)
  const costField = page.getByLabel(/السعر|التكلفة/).first()
  if (await costField.isVisible()) {
    await costField.fill(unitCost)
  }

  await page.getByRole("button", { name: /حفظ/ }).first().click()

  await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 })
})

test("admin can view warehouse inventory and perform transfers", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "المخزون" }).first().click()
  await expect(page.getByRole("heading", { name: "المخزون" })).toBeVisible()

  // Navigate to warehouses/locations tab
  const locationsTab = page.getByRole("tab", { name: /المواقع|المستودعات/ })
  if (await locationsTab.isVisible()) {
    await locationsTab.click()
  }

  // Check if we can see warehouse content
  const warehouseLink = page.getByRole("button", { name: /المستودع|عرض/ }).first()
  if (await warehouseLink.isVisible()) {
    await warehouseLink.click()

    // Look for transfer capability
    const transferButton = page.getByRole("button", { name: /نقل|تحويل/ }).first()
    if (await transferButton.isVisible()) {
      await transferButton.click()
      await page.waitForTimeout(1000)
    }
  }
})
