import { expect, test } from "@playwright/test"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor, seedEmployeeByRole, seedProjectWithManager } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.beforeAll(() => resetE2eDatabase())

test("approves explicit monthly earnings with ordered A/B/A allocations and persists one obligation across reload", async ({ page }) => {
  const suffix = uniqueSuffix()
  const phone = (prefix: string) => `${prefix}${Date.now().toString().slice(-8)}`
  const managerId = seedEmployeeByRole({ firstName: "Manager", lastName: suffix, phone: phone("06"), roleKey: "project_manager" })
  const aName = `Project A ${suffix}`
  const bName = `Project B ${suffix}`
  const a = seedProjectWithManager({ name: aName, managerId })
  const b = seedProjectWithManager({ name: bName, managerId })
  const worker = seedEmployeeByRole({ firstName: "Worker", lastName: suffix, phone: phone("07"), roleKey: "worker", salaryReferenceUnits: 3000000n, salaryPeriod: "MONTHLY" })
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await expect(page.getByRole("heading", { name: "اعتماد الأجور الشهرية" })).toBeVisible()
  await page.getByRole("combobox", { name: "العامل", exact: true }).selectOption(worker)
  await expect(page.getByRole("form", { name: "أشهر الاستحقاق" })).toBeVisible()
  await page.getByLabel("شهر الاستحقاق 1", { exact: true }).fill("2026-11")
  await page.getByLabel("مبلغ الشهر 1", { exact: true }).fill("62500")
  for (const [index, project, amount, days] of [[1, a, "10000", "5"], [2, b, "37500", "15"], [3, a, "15000", "5"]] as const) {
    await page.getByRole("button", { name: "إضافة جزء للشهر 1", exact: true }).click()
    await page.getByRole("combobox", { name: `مشروع الجزء ${index} من الشهر 1`, exact: true }).selectOption(project)
    await page.getByLabel(`مبلغ الجزء ${index} من الشهر 1`, { exact: true }).fill(amount)
    await page.getByLabel(`أيام الجزء ${index} من الشهر 1 — اختياري`, { exact: true }).fill(days)
  }
  await page.getByLabel("المبلغ غير المنسوب لمشروع في الشهر 1", { exact: true }).fill("0")
  const response = page.waitForResponse(r => /workforceExact[/.]approveMonthlyEarnings/.test(r.url()) && r.request().method() === "POST")
  await page.getByRole("button", { name: /اعتماد الأجرة/ }).click()
  expect((await response).status()).toBe(200)
  await expect(page.getByRole("status").filter({ hasText: "تم اعتماد الأجرة" })).toBeVisible()
  await page.reload()
  await page.getByRole("combobox", { name: "العامل", exact: true }).selectOption(worker)
  const saved = page.getByRole("table").getByRole("row").filter({ hasText: "2026-11-01" })
  await expect(saved).toHaveCount(1)
  await expect(saved).toContainText("62,500")
  const allocations = saved.locator("li")
  await expect(allocations.nth(0)).toContainText(aName)
  await expect(allocations.nth(0)).toContainText("10,000")
  await expect(allocations.nth(1)).toContainText(bName)
  await expect(allocations.nth(1)).toContainText("37,500")
  await expect(allocations.nth(2)).toContainText(aName)
  await expect(allocations.nth(2)).toContainText("15,000")
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    const earnings = db.prepare("SELECT id,approved_amount_minor AS amount,debt_entry_id AS obligation FROM employee_salary_earning WHERE employee_id=?").all(worker) as Array<{ id: string; amount: number; obligation: string }>
    expect(earnings).toHaveLength(1)
    expect(earnings[0]?.amount).toBe(6250000)
    expect(earnings[0]?.obligation).toBeTruthy()
    expect(db.prepare("SELECT project_id AS project,amount_minor AS amount,days FROM employee_salary_earning_segment WHERE earning_id=? ORDER BY ordinal").all(earnings[0]!.id)).toEqual([
      { project: a, amount: 1000000, days: 5 }, { project: b, amount: 3750000, days: 15 }, { project: a, amount: 1500000, days: 5 },
    ])
    expect(db.prepare("SELECT COUNT(*) AS count FROM debt_entry WHERE id=?").get(earnings[0]!.obligation)).toEqual({ count: 1 })
  } finally { db.close() }
  await page.goto(`/projects/${a}?tab=cost`)
  await expect(page.getByRole("main")).toContainText("25,000")
  await page.goto(`/projects/${b}?tab=cost`)
  await expect(page.getByRole("main")).toContainText("37,500")
})
