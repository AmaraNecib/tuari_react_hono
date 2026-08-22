import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test.beforeAll(() => {
  resetE2eDatabase()
})

test.describe("employees — critical path", () => {
  test("admin creates an employee with phone + role and the list shows them immediately", async ({ page }) => {
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
    const phoneSalt = Array.from(suffix).reduce(
      (hash, character) => (hash * 31 + character.charCodeAt(0)) % 90_000_000,
      0,
    )
    const phone = `06${String(phoneSalt).padStart(8, "0")}`

    await page.getByLabel("الاسم الأول").first().fill(firstName)
    await page.getByLabel("اللقب").first().fill(lastName)
    await page.getByLabel("رقم الهاتف").first().fill(phone)
    // Select a seeded selectable role explicitly (do not rely on the form
    // default). Only the workforce labels are assignable now — manager/viewer
    // were removed — and worker additionally requires a workplace placement,
    // so use the project_manager label (مدير مشروع).
    await page.getByLabel("الدور").selectOption({ label: "مدير مشروع" })
    // Salary period + amount are conditionally required as a pair — fill both
    // so the form's validation accepts the submission.
    await page.getByLabel("دورية الأجر").selectOption({ label: "شهري" })
    await page.getByLabel(/قيمة الأجر/).fill("10000")

    await page.getByRole("button", { name: "حفظ العامل" }).click()

    // The save returns to the list where the new employee's full name renders.
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 10_000 })
  })

  test("admin changes an employee's role via the edit page", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    // Open the employee created in the previous test (serial mode).
    await page.getByRole("button", { name: /^عرض$/ }).first().click()
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()

    await page.getByRole("link", { name: /^تعديل$/ }).first().click()
    await expect(page.getByRole("heading", { name: /تعديل عامل/ })).toBeVisible()

    // Switch the role between two selectable workforce labels (manager/viewer
    // were removed with the single-actor model; warehouse_manager is selectable).
    await page.getByLabel("الدور").selectOption({ label: "مدير مخزن" })
    await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()

    // The save navigates back to the details page where the new role renders.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("مدير مخزن")).toBeVisible()
  })

  test("admin soft-deletes an employee and the list no longer shows them", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    const row = page.getByRole("row", { name: /بن صالح/ }).first()
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: "حذف" }).click()

    await expect(page.getByRole("alertdialog")).toBeVisible()
    await page.getByRole("button", { name: "تأكيد" }).click()

    // The row disappears from the list (queryAllByRole — an empty result
    // legitimately reaches zero matches and getAllByRole would throw).
    await expect
      .poll(async () => page.getByRole("row", { name: /بن صالح/ }).count())
      .toBe(0)
  })
})
