import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates a project and it appears in the projects list", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "المشاريع" }).first().click()
  await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة مشروع" }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة مشروع/ })).toBeVisible()

  const projectName = `موقع البناء ${uniqueSuffix()}`

  await page.getByLabel(/الاسم/).first().fill(projectName)
  await page.getByRole("button", { name: "حفظ المشروع" }).click()

  await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 })
})

test("admin can create and configure a project with manager assignment", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // Create a project first
  await page.getByRole("link", { name: "المشاريع" }).first().click()
  await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة مشروع" }).first().click()
  const projectName = `مشروع متقدم ${uniqueSuffix()}`

  await page.getByLabel(/الاسم/).first().fill(projectName)
  const locationField = page.getByLabel(/الموقع/)
  if (await locationField.isVisible()) {
    await locationField.fill("الموقع التجريبي")
  }

  await page.getByRole("button", { name: "حفظ المشروع" }).click()
  await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 })

  // Click on the project to view its details
  await page.getByText(projectName).first().click()
  await expect(page.getByRole("heading", { name: /تفاصيل المشروع|تفاصيل/ })).toBeVisible({ timeout: 5_000 })
})
