import { expect, test } from "@playwright/test"

import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import {
  seedEmployeeByRole,
  seedProjectAssignment,
  seedProjectWithManager,
} from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

/**
 * Issue #412 — the salary payment dialog: proposed amount, split prefill from
 * the assignment, the unallocated remainder, the over-allocation block, and
 * the recorded payment's days.
 *
 * Employee creation through the UI is role-constrained (established pattern),
 * so the salaried worker and the project are seeded directly into the shared
 * E2E database. The assignment window is open-ended and starts in 2000, so it
 * covers whichever month the payment dialog defaults to.
 */

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

const SALARY_DZD = 30000

let workerName = ""
let projectId = ""

test.beforeAll(() => {
  resetE2eDatabase()

  const suffix = uniqueSuffix()
  // Valid Algerian phones (0[5-7] + 8 digits), unique per attempt.
  const digits = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`

  const managerId = seedEmployeeByRole({
    firstName: "مدير",
    lastName: `الرواتب ${suffix}`,
    phone: `053${digits.slice(0, 7)}`,
    roleKey: "project_manager",
    status: "ACTIVE",
  })
  projectId = seedProjectWithManager({
    name: `مشروع الرواتب ${suffix}`,
    managerId,
  })
  workerName = `عامل الرواتب ${suffix}`
  const workerId = seedEmployeeByRole({
    firstName: "عامل",
    lastName: `الرواتب ${suffix}`,
    phone: `054${digits.slice(0, 7)}`,
    roleKey: "worker",
    status: "ACTIVE",
    salaryAmountDzd: SALARY_DZD,
    salaryPeriod: "MONTHLY",
  })
  seedProjectAssignment({ employeeId: workerId, projectId })
})

async function openPaymentDialog(page: import("@playwright/test").Page) {
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await expect(page.getByRole("heading", { name: "الرواتب" })).toBeVisible()

  await page.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }).click()
  const workerRow = page.getByRole("row").filter({ hasText: workerName })
  await expect(workerRow).toBeVisible()
  await workerRow.getByRole("button", { name: "إضافة دفعة" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog
}

test("proposes salary/30 x days and prefills the split from the assignment", async ({ page }) => {
  const dialog = await openPaymentDialog(page)

  // The prefilled editable amount IS the proposal (the amount follows it until edited).
  const amountInput = dialog.getByLabel("المبلغ المدفوع")
  const daysInput = dialog.getByLabel("الأيام").first()
  await expect(dialog.getByText("المبلغ المقترح")).toBeVisible()
  await expect(daysInput).toHaveValue("30")
  await expect(amountInput).toHaveValue(String(SALARY_DZD))

  // The full-period assignment prefills one line and leaves nothing unallocated.
  await expect(dialog.getByLabel("المشروع")).toHaveValue(projectId)
  await expect(dialog.getByLabel("الأيام").last()).toHaveValue("30")
  await expect(dialog.getByText("أيام غير موزعة: 0")).toBeVisible()

  // A 27-day payment scales both the proposal and the untouched default split.
  await daysInput.fill("27")
  await expect(amountInput).toHaveValue("27000")
  await expect(dialog.getByLabel("الأيام").last()).toHaveValue("27")
  await expect(dialog.getByText("أيام غير موزعة: 0")).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("blocks an over-allocated split and records the payment with its days", async ({ page }) => {
  const dialog = await openPaymentDialog(page)
  const daysInput = dialog.getByLabel("الأيام").first()
  const lineDays = dialog.getByLabel("الأيام").last()
  const submit = dialog.getByRole("button", { name: "إضافة دفعة" })

  // Hand-edit the line first (a hand edit wins over the derived default), then
  // shrink the paid days: the split over-allocates and submit must be blocked.
  await lineDays.fill("20")
  await daysInput.fill("12")
  await expect(dialog.getByText("التوزيع يتجاوز الأيام المدفوعة بـ 8")).toBeVisible()
  await expect(submit).toBeDisabled()

  // Slide the line back to the paid days: valid again, with the remainder explicit.
  await lineDays.fill("12")
  await expect(dialog.getByText("أيام غير موزعة: 0")).toBeVisible()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(dialog).toBeHidden()

  // The payment appears in the history with the days that were paid.
  await page.getByRole("tab", { name: "آخر دفعات الرواتب" }).click()
  const paymentRow = page.getByRole("row").filter({ hasText: workerName })
  await expect(paymentRow).toBeVisible({ timeout: 10_000 })
  await expect(paymentRow.getByRole("cell").nth(2)).toHaveText("12")
})
