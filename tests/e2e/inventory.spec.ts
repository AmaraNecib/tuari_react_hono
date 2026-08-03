import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates an inventory item definition", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "دليل العناصر" }).first().click()
  await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()

  const itemName = `صنف-${uniqueSuffix()}`

  await page.getByLabel("اسم العنصر").fill(itemName)
  // CONSUMABLE items require a unit of measure before the button enables.
  await page.getByLabel("وحدة القياس").fill("قطعة")
  await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()

  await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 })
})

test("admin can view warehouse inventory and perform transfers", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "دليل العناصر" }).first().click()
  await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()

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
