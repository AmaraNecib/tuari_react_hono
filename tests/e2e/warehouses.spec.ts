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

  // The inventory transfer page lists warehouses from the SAME `warehouses`
  // query key / endpoint the workspace page wrote to — one source of truth
  // for warehouse data across both features (issue #236). The fresh boot
  // proves the shared key/endpoint coupling; the create-mutation invalidation
  // seam itself is pinned by the unit integration tests (inventory-hooks) and
  // the typed invalidation helper tests. Options
  // inside a collapsed native <select> are never "visible", so assert
  // presence (count) instead.
  await page.goto("/outbound-transfers/create")
  await expect(page.getByRole("option", { name: warehouseName })).toHaveCount(1)
})

test("admin creates a warehouse manager inline from the warehouse form without losing the form", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "المستودعات" }).first().click()
  await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()

  const suffix = uniqueSuffix()
  const warehouseName = `مستودع المدراء ${suffix}`
  const managerFirstName = `نبيل-${suffix}`
  const managerLastName = "مرابط"
  const phoneSalt = Array.from(suffix).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 90_000_000,
    0,
  )
  const phone = `07${String(phoneSalt).padStart(8, "0")}`
  const managerName = `${managerFirstName} ${managerLastName}`

  await page.getByLabel(/اسم/).first().fill(warehouseName)

  const managerSelect = page.getByRole("combobox", { name: /المدير المسؤول/ })
  await managerSelect.click()
  await page.getByRole("option", { name: /إضافة موظف/ }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "إضافة موظف" })).toBeVisible()
  await dialog.getByPlaceholder("اسم الموظف...").fill(managerFirstName)
  await dialog.getByPlaceholder("لقب الموظف...").fill(managerLastName)
  await dialog.getByPlaceholder("0612345678").fill(phone)
  await dialog.getByRole("button", { name: "إنشاء" }).click()

  await expect(dialog).toBeHidden()
  await expect(managerSelect).toContainText(managerName, { timeout: 10_000 })
  await expect(page.getByLabel(/اسم/).first()).toHaveValue(warehouseName)

  await page.getByRole("button", { name: "حفظ المستودع" }).click()

  await expect(page.getByRole("heading", { name: warehouseName })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(managerName)).toBeVisible()
})
