import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test.beforeAll(() => {
  resetE2eDatabase()
})

test.describe("projects — critical path", () => {
  test("admin creates a project and lands on its details page", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "المشاريع" }).first().click()
    await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible()

    await page.getByRole("button", { name: "إضافة مشروع" }).first().click()
    await expect(page.getByRole("heading", { name: /إضافة مشروع/ })).toBeVisible()

    const projectName = `موقع البناء ${uniqueSuffix()}`
    const location = "الجزائر العاصمة"

    await page.getByLabel(/اسم/).first().fill(projectName)
    await page.getByLabel(/الموقع/).fill(location)
    // Keep the default ACTIVE status — the form's status select defaults to
    // "نشط" and no change is needed.
    await page.getByRole("button", { name: "حفظ المشروع" }).click()

    // The save flow navigates straight to the project details page.
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 })

    // The overview shows the status and location of the new project. `exact:
    // true` keeps the status text from matching the hidden status-select
    // option on the edit page during the save transition.
    await expect(page.getByText("نشط", { exact: true })).toBeVisible()
    await expect(page.getByText(location)).toBeVisible()
  })

  test("admin closes a project and the details page reflects it", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "المشاريع" }).first().click()
    await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible()

    // Open the project created in the previous test (serial mode).
    const row = page.getByRole("row", { name: /موقع البناء/ }).first()
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: /^عرض$/ }).first().click()
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()

    await page.getByRole("link", { name: /^تعديل$/ }).first().click()
    await expect(page.getByRole("heading", { name: /تعديل مشروع/ })).toBeVisible()

    // Close the project by moving its status to COMPLETED (مكتمل).
    await page.getByLabel(/الحالة/).selectOption({ label: "مكتمل" })
    await page.getByRole("button", { name: "حفظ التغييرات" }).click()

    // The details page now shows the closed status (exact match so the hidden
    // status-select option on the edit page can't match during the transition).
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("مكتمل", { exact: true })).toBeVisible()
  })
})
