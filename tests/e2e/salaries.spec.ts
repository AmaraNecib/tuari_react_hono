import { installManagedApiLifecycle } from "./helpers/test"
import { expect, test } from "./helpers/test"

import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import {
  findE2eDatabase,
  loadDatabaseConstructor,
  readEmployeeEarningSegmentsByEmployeeId,
  seedEmployeeByRole,
  seedProjectAssignment,
  seedProjectWithManager,
} from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

let workerName = ""
let workerId = ""
let projectId = ""

test.beforeAll(async () => {
  await resetE2eDatabase()
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

function readPayrollCash() {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    return db.prepare("SELECT id FROM employee_salary_cash WHERE employee_id = ?").all(workerId)
  } finally {
    db.close()
  }
}

async function openApprovalPage(page: import("@playwright/test").Page) {
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await expect(page.getByRole("heading", { name: "الرواتب" })).toBeVisible()
  await page.getByRole("tab", { name: "مراجع أجور العاملين" }).click()
  const row = page.getByRole("row").filter({ hasText: workerName })
  await expect(row).toBeVisible()
  await row.getByRole("button", { name: /اعتماد الأجر/ }).click()
  await expect(page).toHaveURL(/\/employees\/[^/]+\/earnings\/new\?returnTo=salaries/)
  await expect(page.getByRole("heading", { name: "اعتماد الأجر المكتسب" })).toBeVisible()
  const approvalForm = page.getByRole("main").locator("form")
  await expect(approvalForm).toBeVisible()
  return approvalForm
}

test("approval derives the remainder and requires acknowledgement before any write", async ({ page }) => {
  const approvalForm = await openApprovalPage(page)
  const total = approvalForm.getByLabel("إجمالي الأجر المعتمد")
  await total.fill("27000.00")
  await expect(total).toHaveValue("27000.00")
  await expect(approvalForm.getByLabel("دون مشروع")).toContainText("27,000")
  const acknowledgement = approvalForm.getByRole("checkbox")
  await expect(acknowledgement).toBeVisible()
  const requests: string[] = []
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/rpc/")) requests.push(request.url())
  })
  await approvalForm.getByRole("button", { name: "اعتماد الأجر", exact: true }).click()
  await expect(approvalForm.getByRole("alert")).toContainText("أكّد أن المبلغ المتبقي سيبقى غير موزع قبل الاعتماد.")
  expect(requests).toHaveLength(0)
  expect(readEmployeeEarningSegmentsByEmployeeId(workerId)).toEqual([])
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    expect(db.prepare("SELECT id FROM employee_earning WHERE employee_id = ?").all(workerId)).toEqual([])
  } finally { db.close() }
  expect(readPayrollCash()).toEqual([])
  await acknowledgement.check()
  await expect(approvalForm.getByRole("alert")).toHaveCount(0)
  await approvalForm.getByRole("button", { name: "إلغاء" }).click()
  await expect(page.getByRole("heading", { name: "الرواتب" })).toBeVisible()
})

test("approval keeps project attribution and independent segment amounts without paying cash", async ({ page }) => {
  const approvalForm = await openApprovalPage(page)
  await approvalForm.getByRole("button", { name: "إضافة بند مشروع" }).click()
  const project = approvalForm.getByLabel("المشروع 1")
  const days = approvalForm.getByLabel("أيام العمل 1")
  const segmentAmount = approvalForm.getByLabel("المبلغ 1")
  await project.selectOption(projectId)
  await days.fill("12")
  await segmentAmount.fill("12000.00")
  const total = approvalForm.getByLabel("إجمالي الأجر المعتمد")
  const remainder = approvalForm.getByLabel("دون مشروع")
  await total.fill("15000.00")
  await days.fill("8")
  await expect(segmentAmount).toHaveValue("12000.00")
  await expect(remainder).toContainText("3,000")
  await days.fill("12")
  await expect(remainder).toContainText("3,000")
  await approvalForm.getByRole("checkbox").check()
  await approvalForm.getByRole("button", { name: "اعتماد الأجر", exact: true }).click()
  await expect(page.getByRole("heading", { name: "الرواتب" })).toBeVisible()
  expect(readEmployeeEarningSegmentsByEmployeeId(workerId)).toEqual([
    { projectId, days: 12, amountMinor: "1200000" },
  ])
  expect(readPayrollCash()).toEqual([])
  await page.getByRole("tab", { name: "سجل الأجور المعتمدة", exact: true }).click()
  await expect(page.getByRole("table", { name: "سجل الأجور المعتمدة" }).getByRole("row").filter({ hasText: workerName })).toContainText("15,000")
})

test("salary reference grouping persists across salary and employee views", async ({ page }, testInfo) => {
  const fractionalWorkerId = seedEmployeeByRole({
    firstName: "عامل", lastName: "عرض تجريبي", phone: `055${Date.now().toString().slice(-7)}`,
    roleKey: "worker", status: "ACTIVE", salaryReferenceAmount: "1234.56",
    salaryReferencePeriod: "MONTHLY",
  })
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await page.getByRole("tab", { name: "مراجع أجور العاملين" }).click()
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
  await page.getByRole("tab", { name: "مراجع أجور العاملين" }).click()
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
  await page.getByRole("tab", { name: "مراجع أجور العاملين" }).click()
  await expect(fractionalRow).toContainText("1,234.56")
  await expect(wholeRow).toContainText("30,000")
  await expect(wholeRow).not.toContainText("30,000.00")
})
