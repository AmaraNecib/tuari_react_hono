import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test.describe("employees", () => {
  test("admin creates an employee and the new record appears in the list", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    // The header action is a navigation link (deep-linkable to /employees/create).
    // The table's empty-state "add worker" BUTTON only renders when the list is
    // empty, so relying on it makes this spec order-dependent: in the full suite
    // (e.g. after employees-search seeds rows) it never appears. The header link
    // is always present regardless of list state.
    await page.getByRole("link", { name: "إضافة عامل" }).first().click()
    await expect(page.getByRole("heading", { name: /صفحة إضافة العاملين/ })).toBeVisible()

    const suffix = uniqueSuffix()
    const firstName = `أحمد-${suffix}`
    const lastName = `بن صالح`
    const phone = `06${Math.floor(10000000 + Math.random() * 89999999)}`

    await page.getByLabel("الاسم الأول").first().fill(firstName)
    await page.getByLabel("اللقب").first().fill(lastName)
    await page.getByLabel("رقم الهاتف").first().fill(phone)
    // Select the seeded manager role explicitly (do not rely on the form default).
    await page.getByLabel("الدور").selectOption({ label: "مدير عمليات" })
    // Salary period + amount are conditionally required as a pair — fill both
    // so the form's validation accepts the submission.
    await page.getByLabel("دورية الأجر").selectOption({ label: "شهري" })
    await page.getByLabel(/قيمة الأجر/).fill("10000")

    await page.getByRole("button", { name: "حفظ العامل" }).click()

    await expect(page.getByText(firstName)).toBeVisible({ timeout: 10_000 })
  })

  test("admin can update an employee record", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    // Click the first employee in the list to view their details
    await page.getByRole("button", { name: /^عرض$/ }).first().click()

    // Wait for the employee detail page to load (heading is the employee name)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()

    // Find and click the edit link
    await page.getByRole("link", { name: /^تعديل$/ }).first().click()
    await expect(page.getByRole("heading", { name: /تعديل عامل/ })).toBeVisible()

    // Update employee notes — the notes field is always present on the edit page.
    const notesField = page.getByLabel(/ملاحظات/).first()
    await expect(notesField).toBeVisible()
    const updatedNotes = `تحديث-${uniqueSuffix()}`
    await notesField.fill(updatedNotes)
    await page.getByRole("button", { name: /حفظ/ }).first().click()
    // Save navigates back to the details page where the updated notes render
    await expect(page.getByText(updatedNotes)).toBeVisible({ timeout: 10_000 })
  })
})
