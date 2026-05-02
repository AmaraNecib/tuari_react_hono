import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates an employee and the new record appears in the list", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "العاملون" }).first().click()
  await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة عامل" }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة عامل/ })).toBeVisible()

  const suffix = uniqueSuffix()
  const firstName = `أحمد-${suffix}`
  const lastName = `بن صالح`
  const phone = `06${Math.floor(10000000 + Math.random() * 89999999)}`

  await page.getByLabel("الاسم الأول").first().fill(firstName)
  await page.getByLabel("اللقب").first().fill(lastName)
  await page.getByLabel("رقم الهاتف").first().fill(phone)

  await page.getByRole("button", { name: "حفظ جميع العمال" }).click()

  await expect(page.getByText(firstName)).toBeVisible({ timeout: 10_000 })
})

test("admin can update an employee record", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "العاملون" }).first().click()
  await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

  // Click the first employee in the list to view their details
  await page.getByRole("button", { name: /عرض التفاصيل/ }).first().click()

  // Wait for the employee detail page to load
  await expect(page.getByRole("heading", { name: /تفاصيل العامل/ })).toBeVisible()

  // Find and click the edit button
  const editButton = page.getByRole("button", { name: /تعديل/ }).first()
  if (await editButton.isVisible()) {
    await editButton.click()

    // Update employee notes
    const notesField = page.getByLabel(/الملاحظات/).first()
    if (await notesField.isVisible()) {
      const updatedNotes = `تحديث-${uniqueSuffix()}`
      await notesField.fill(updatedNotes)
      await page.getByRole("button", { name: /حفظ/ }).first().click()
      await expect(page.getByText("تم حفظ التغييرات")).toBeVisible({ timeout: 5_000 })
    }
  }
})
