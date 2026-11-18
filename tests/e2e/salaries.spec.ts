import { expect, test } from "@playwright/test"

import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import {
  readEmployeeEarningSegmentsByEmployeeId,
  readSalaryPaymentSplitsByEmployeeId,
  seedEmployeeByRole,
  seedProjectAssignment,
  seedProjectWithManager,
} from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

let workerName = ""
let workerId = ""
let projectId = ""

test.beforeAll(() => {
  resetE2eDatabase()
  const suffix = uniqueSuffix()
  const digits = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`
  const managerId = seedEmployeeByRole({
    firstName: "مدير", lastName: `الرواتب ${suffix}`, phone: `053${digits.slice(0, 7)}`,
    roleKey: "project_manager", status: "ACTIVE",
  })
  projectId = seedProjectWithManager({ name: `مشروع الرواتب ${suffix}`, managerId })
  workerName = `عامل الرواتب ${suffix}`
  workerId = seedEmployeeByRole({
    firstName: "عامل", lastName: `الرواتب ${suffix}`, phone: `054${digits.slice(0, 7)}`,
    roleKey: "worker", status: "ACTIVE", salaryReferenceAmount: "30000.00",
    salaryReferencePeriod: "MONTHLY",
  })
  seedProjectAssignment({ employeeId: workerId, projectId })
})

async function openApprovalDialog(page: import("@playwright/test").Page) {
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await expect(page.getByRole("heading", { name: "الرواتب" })).toBeVisible()
  await page.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }).click()
  const row = page.getByRole("row").filter({ hasText: workerName })
  await expect(row).toBeVisible()
  await row.getByRole("button", { name: /اعتماد الأجر/ }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog
}

test("approval conserves the entered total and explicit remainder", async ({ page }) => {
  const dialog = await openApprovalDialog(page)
  const total = dialog.getByLabel("إجمالي الأجر المعتمد بالدينار الجزائري")
  const remainder = dialog.getByLabel("المبلغ غير الموزع بالدينار الجزائري")
  await total.fill("27000.00")
  await remainder.fill("27000.00")
  await expect(total).toHaveValue("27000.00")
  await expect(remainder).toHaveValue("27000.00")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("approval keeps project attribution and independent segment amounts without paying cash", async ({ page }) => {
  const dialog = await openApprovalDialog(page)
  await dialog.getByRole("button", { name: "إضافة بند مشروع" }).click()
  const project = dialog.getByLabel("المشروع 1")
  const days = dialog.getByLabel("أيام العمل 1")
  const segmentAmount = dialog.getByLabel("المبلغ بالدينار الجزائري 1")
  await project.selectOption(projectId)
  await days.fill("12")
  await segmentAmount.fill("12000.00")
  const total = dialog.getByLabel("إجمالي الأجر المعتمد بالدينار الجزائري")
  const remainder = dialog.getByLabel("المبلغ غير الموزع بالدينار الجزائري")
  await total.fill("15000.00")
  await remainder.fill("3000.00")
  await days.fill("8")
  await expect(segmentAmount).toHaveValue("12000.00")
  await expect(remainder).toHaveValue("3000.00")
  await days.fill("12")
  await dialog.getByRole("button", { name: "اعتماد الأجر", exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(readEmployeeEarningSegmentsByEmployeeId(workerId)).toEqual([
    { projectId, days: 12, amountMinor: "1200000" },
  ])
  expect(readSalaryPaymentSplitsByEmployeeId(workerId)).toEqual([])
  await page.getByRole("tab", { name: "آخر دفعات الرواتب" }).click()
  await expect(page.getByRole("row").filter({ hasText: workerName })).toHaveCount(0)
})

test("salary reference grouping persists across salary and employee views", async ({ page }, testInfo) => {
  const fractionalWorkerId = seedEmployeeByRole({
    firstName: "عامل", lastName: "عرض تجريبي", phone: `055${Date.now().toString().slice(-7)}`,
    roleKey: "worker", status: "ACTIVE", salaryReferenceAmount: "1234.56",
    salaryReferencePeriod: "MONTHLY",
  })
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await page.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }).click()
  const fractionalRow = page.getByRole("row").filter({ hasText: "عامل عرض تجريبي" })
  const wholeRow = page.getByRole("row").filter({ hasText: workerName })
  await expect(wholeRow).toContainText("30,000")
  await expect(wholeRow).not.toContainText("30,000.00")
  await expect(fractionalRow).toContainText("1,234.56")
  await fractionalRow.screenshot({ path: testInfo.outputPath("after-salary-grouped.png") })
  await page.goto(`/employees/${fractionalWorkerId}?tab=finance`)
  const wageCard = page.getByRole("article").filter({ hasText: "الأجر الحالي" })
  await expect(wageCard).toContainText("1,234.56")
  await wageCard.screenshot({ path: testInfo.outputPath("after-employee-grouped.png") })

  await page.goto("/settings?tab=appearance")
  const format = page.getByRole("combobox", { name: /^فواصل الآلاف في المبالغ/ })
  await expect(format).toHaveValue("grouped")
  await format.selectOption("plain")
  await expect(page.getByText("1234.56 / 1234", { exact: true })).toBeVisible()
  await format.locator("xpath=../..").screenshot({ path: testInfo.outputPath("after-settings.png") })
  await page.reload()
  await expect(format).toHaveValue("plain")

  await page.goto(`/employees/${fractionalWorkerId}?tab=finance`)
  await expect(wageCard).toContainText("1234.56")
  await expect(wageCard).not.toContainText("1,234")
  await wageCard.screenshot({ path: testInfo.outputPath("after-employee-plain.png") })
  await page.goto("/salaries")
  await page.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }).click()
  await expect(fractionalRow).toContainText("1234.56")
  await expect(fractionalRow).not.toContainText("1,234")
  await expect(wholeRow).toContainText("30000")
  await expect(wholeRow).not.toContainText("30000.00")
  await fractionalRow.screenshot({ path: testInfo.outputPath("after-salary-plain.png") })

  await page.goto("/settings?tab=appearance")
  await format.focus()
  await page.keyboard.press("Home")
  await page.keyboard.press("Enter")
  await expect(format).toHaveValue("grouped")
  await page.goto("/salaries")
  await page.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }).click()
  await expect(fractionalRow).toContainText("1,234.56")
  await expect(wholeRow).toContainText("30,000")
  await expect(wholeRow).not.toContainText("30,000.00")
})
