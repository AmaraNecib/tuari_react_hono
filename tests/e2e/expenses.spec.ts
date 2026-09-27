import { expect, test } from "@playwright/test"

import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { seedEmployeeByRole, seedProjectWithManager } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

/**
 * Expenses critical path (issue #411): record an expense tagged to a project,
 * see it in the flat table and the total strip, switch the same list to
 * project-grouped cards, then void it and see it stay visible while leaving
 * the totals.
 *
 * Deterministic: no sleeps. The project/manager rows are seeded directly
 * (project creation through the UI is not part of this spec) and the expense
 * date defaults to today, which is inside the screen's default month-to-date
 * filter.
 */

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")

test.beforeAll(() => {
  resetE2eDatabase()
})

test("record an expense against a project, group it, then void it out of the totals", async ({ page }) => {
  const suffix = uniqueSuffix()
  const managerId = seedEmployeeByRole({
    firstName: "مدير",
    lastName: `مشروع ${suffix}`,
    phone: derivePhone(suffix),
    roleKey: "project_manager",
  })
  const projectName = `مشروع مصروفات ${suffix}`
  seedProjectWithManager({ name: projectName, managerId })

  await bootstrapOrSignIn(page)

  // المالية group → المصروفات
  await page.getByRole("link", { name: "المصروفات" }).first().click()
  await expect(page.getByRole("heading", { name: "المصروفات" })).toBeVisible({ timeout: 15_000 })

  // Empty state, zero total.
  await expect(page.getByText("لا توجد مصروفات")).toBeVisible()
  await expect(page.getByText("مجموع المعروض · 0 مصروفات")).toBeVisible()

  // Add an expense tagged to the seeded project.
  const whatFor = `هاتف ورشة ${suffix}`
  await page.getByRole("button", { name: "+ مصروف جديد" }).click()
  await expect(page.getByRole("dialog").getByRole("heading", { name: "مصروف جديد" })).toBeVisible()

  const dialog = page.getByRole("dialog")
  // The date field is prefilled with today's dd/MM/yyyy in the shared
  // DatePicker's display format, so the placeholder is gone and the initial
  // date is visibly selected (regression: the form used to feed yyyy-MM-dd).
  await expect(dialog.getByText("dd/mm/yyyy")).toHaveCount(0)
  await expect(dialog.getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeVisible()
  await dialog.getByPlaceholder("0", { exact: true }).fill("12500")
  await dialog.getByLabel("البيان").fill(whatFor)
  await dialog.getByLabel("المشروع (اختياري)").selectOption({ label: projectName })
  await dialog.getByRole("button", { name: "مصروف جديد", exact: true }).click()

  // The row appears and the total strip reflects it (the list refetches on the
  // expenses mutation invalidation; no reload).
  await expect(page.getByRole("cell", { name: whatFor })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("مجموع المعروض · 1 مصروفات")).toBeVisible()
  await expect(page.getByText("12,500 دج").first()).toBeVisible()

  // The project is charged the whole amount (the group card carries it).
  await page.getByRole("button", { name: "تجميع حسب المشروع" }).click()
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("12,500 دج").first()).toBeVisible()

  // Back to the flat table to void the row.
  await page.getByRole("button", { name: "تجميع حسب المشروع" }).click()
  const row = page.getByRole("row", { name: new RegExp(whatFor) })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await row.getByRole("button", { name: "إلغاء" }).click()

  const voidDialog = page.getByRole("dialog")
  await expect(voidDialog.getByRole("heading", { name: "إلغاء المصروف" })).toBeVisible()
  await voidDialog.getByRole("button", { name: "تأكيد الإلغاء" }).click()

  // Void, never delete: the row stays visible (struck-through + ملغى badge)
  // while the total and the count drop it.
  await expect(row.getByText("ملغى", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("مجموع المعروض · 0 مصروفات")).toBeVisible()
  await expect(page.getByText("0 دج").first()).toBeVisible()
  // The live void button is gone from the voided row, and so is Edit: the
  // service rejects editing a voided expense, so offering it would only let
  // the user fill a dialog whose Save fails.
  await expect(row.getByRole("button", { name: "إلغاء" })).toHaveCount(0)
  await expect(row.getByRole("button", { name: "تعديل" })).toHaveCount(0)
})

/** Derive a unique valid Algerian mobile number from the per-attempt suffix. */
function derivePhone(suffix: string) {
  const salt = Array.from(suffix).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 90_000_000,
    0,
  )
  return `07${String(salt).padStart(8, "0")}`
}
