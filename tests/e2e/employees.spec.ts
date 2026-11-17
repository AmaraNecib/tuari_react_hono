import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

test.beforeAll(() => {
  resetE2eDatabase()
})

test.describe("employees — critical path", () => {
  test("admin creates an employee with phone + role and the list shows them immediately", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    await page.getByRole("button", { name: "إضافة عامل", exact: true }).click()
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
    // This unreferenced manager can change roles and be deleted without losing placement evidence.
    await page.getByLabel("صلاحية التطبيق").selectOption({ label: "مدير مشروع" })
    // Salary period + amount are conditionally required as a pair — fill both
    // so the form's validation accepts the submission.
    await page.getByLabel("دورية الأجر").selectOption({ label: "شهري" })
    await page.getByLabel(/قيمة الأجر/).fill("10000")

    await page.getByRole("button", { name: "إنشاء", exact: true }).click()

    // The save returns to the list where the new employee's full name renders.
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 10_000 })
  })

  test("admin changes an employee's role via the edit page", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    await page.getByRole("row", { name: /بن صالح/ }).getByRole("button", { name: "تعديل", exact: true }).click()
    await expect(page.getByRole("heading", { name: /تعديل عامل/ })).toBeVisible()

    // Switch the role between two selectable workforce labels (manager/viewer
    // were removed with the single-actor model; warehouse_manager is selectable).
    await page.getByLabel("صلاحية التطبيق").selectOption({ label: "مدير مخزن" })
    await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()

    // The save navigates back to the details page where the new role renders.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("مدير مخزن")).toBeVisible()
    await page.getByRole("link", { name: "العاملون" }).first().click()
    await page.getByRole("row", { name: /بن صالح/ }).getByRole("button", { name: "تعديل", exact: true }).click()
    await expect(page.getByLabel("دورية الأجر")).toHaveValue("MONTHLY")
    await expect(page.getByLabel(/قيمة الأجر/)).toHaveValue("10000.00")
  })

  test("admin deletes an unreferenced employee only after confirmation", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "العاملون" }).first().click()
    await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

    const row = page.getByRole("row", { name: /بن صالح/ }).first()
    await expect(row).toBeVisible()
    const employeeName = await row.getByRole("cell").first().innerText()
    await page.keyboard.press("Control+k")
    await page.getByRole("dialog").getByPlaceholder("بحث...").fill(employeeName)
    await expect(page.getByRole("dialog").getByText(employeeName, { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await row.getByRole("button", { name: "حذف" }).click()

    await expect(page.getByRole("alertdialog")).toBeVisible()
    await page.getByRole("alertdialog").getByRole("button", { name: "إلغاء", exact: true }).click()
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: "حذف" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "تأكيد", exact: true }).click()

    // The row disappears from the list (queryAllByRole — an empty result
    // legitimately reaches zero matches and getAllByRole would throw).
    await expect
      .poll(async () => page.getByRole("row", { name: /بن صالح/ }).count())
      .toBe(0)
    await page.keyboard.press("Control+k")
    await page.getByRole("dialog").getByPlaceholder("بحث...").fill(employeeName)
    await expect(page.getByRole("dialog").getByText("لا توجد نتائج", { exact: true })).toBeVisible()
    await expect(page.getByRole("dialog").getByText(employeeName, { exact: true })).toHaveCount(0)
  })
})
