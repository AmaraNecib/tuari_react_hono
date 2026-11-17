import { expect, test } from "@playwright/test"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"
import { seedEmployeeByRole } from "./helpers/db-seed"
import { assertCapabilityBoundary } from "./helpers/capability-boundary"

test("admin creates a warehouse and it persists after returning to the production list", async ({ page }) => {
  await bootstrapOrSignIn(page)
  await page.goto("/warehouses/create")
  const name = `مستودع رقم ${uniqueSuffix()}`
  await page.getByLabel("اسم المستودع").fill(name)
  await page.getByRole("button", { name: "حفظ المستودع" }).click()
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  await page.goto("/warehouses")
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible()
})

test("warehouse transfers remain unavailable without invoking the legacy numeric transfer", async ({ page }) => {
  await assertCapabilityBoundary(page, { path: "/outbound-transfers/create", capability: "inventoryMoney", procedure: "inventoryOutboundTransfersCreate" })
})

test("an existing exact warehouse manager stays selected through save and fresh read", async ({ page }) => {
  await bootstrapOrSignIn(page)
  const suffix = uniqueSuffix()
  const firstName = `نبيل-${suffix}`
  const managerName = `${firstName} مرابط`
  seedEmployeeByRole({ firstName, lastName: "مرابط", phone: `07${Date.now().toString().slice(-8)}`, roleKey: "warehouse_manager" })
  await page.goto("/warehouses/create")
  const name = `مستودع المدراء ${suffix}`
  await page.getByLabel("اسم المستودع").fill(name)
  const manager = page.getByRole("combobox", { name: /المدير المسؤول/ })
  await manager.click()
  await expect(page.getByRole("option", { name: /إضافة موظف/ })).toHaveCount(0)
  await page.getByRole("option", { name: managerName, exact: true }).click()
  await expect(manager).toContainText(managerName)
  await expect(page.getByLabel("اسم المستودع")).toHaveValue(name)
  await page.getByRole("button", { name: "حفظ المستودع" }).click()
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("main").getByText(managerName, { exact: true })).toBeVisible()
})
