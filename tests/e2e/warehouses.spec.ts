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

test("a warehouse created in the workspace appears in the inventory transfer selector", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "المستودعات" }).first().click()
  await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()

  const warehouseName = `مستودع رقم ${uniqueSuffix()}`

  await page.getByLabel(/اسم/).first().fill(warehouseName)
  await page.getByRole("button", { name: "حفظ المستودع" }).click()

  await expect(page.getByText(warehouseName)).toBeVisible({ timeout: 10_000 })

  // The inventory transfer page lists warehouses from the shared `warehouses`
  // query key — the workspace create mutation invalidates it through the
  // typed invalidation helper, so the new warehouse must appear in the
  // transfer "from" selector without a manual refresh. Pins the workspace /
  // inventory query-key seam (issue #236). Options inside a collapsed native
  // <select> are never "visible", so assert presence (count) instead.
  await page.goto("/outbound-transfers/create")
  await expect(page.getByRole("option", { name: warehouseName })).toHaveCount(1)
})
