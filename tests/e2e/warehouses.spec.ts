import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates a warehouse and it appears in the warehouses list", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "المستودعات" }).first().click()
  await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()

  const warehouseName = `مستودع رقم ${uniqueSuffix()}`

  await page.getByLabel(/اسم/).first().fill(warehouseName)
  await page.getByRole("button", { name: "حفظ المستودع" }).click()

  await expect(page.getByText(warehouseName)).toBeVisible({ timeout: 10_000 })
})
