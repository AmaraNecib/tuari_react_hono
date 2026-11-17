import { expect, test, type Page } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

test.describe.configure({ mode: "serial" })

/**
 * Any text matching a dotted i18n key shape for a known top-level namespace is
 * a leaked raw key (i18next returns the key when the resource lacks it).
 * Issue #271: ~69 call sites rendered raw keys in reachable routes.
 */
const RAW_KEY_PATTERN =
  /(?:^|[\s(“„])(?:common|shell|debts|detailPages|systemLog|inventory|inventoryPage|auth|workspace|appShell|sections|search|license|dashboardPage|dashboard|validation|reports|externals|externalsPage|auditLog|toasts|shortcuts|columns|status|tables|historyEvent|systemRoles|employeeForm|salaries|metrics|mockData|salaryEarnings|salaryMonthly|salaryAllocations|application|batchOperations|exportImport|debtsHub|debtLedger|debtCases|tour|update)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*(?![\w.])/

async function expectNoRawKeys(page: Page) {
  const bodyText = await page.locator("body").innerText()
  expect(bodyText).not.toMatch(RAW_KEY_PATTERN)
}

test("unavailable transactions and debt routes render translated capability copy, not raw keys", async ({ page }) => {
  await bootstrapOrSignIn(page)
  for (const path of ["/transactions", "/debts"]) {
    await page.goto(path)
    await expect(page.getByRole("main").getByText("هذا القسم المالي غير متاح في هذه النسخة.", { exact: true })).toBeVisible()
    await expect(page.getByRole("main").locator("form")).toHaveCount(0)
    await expectNoRawKeys(page)
  }
})

test("the current earning approval page renders Arabic without raw salary keys", async ({ page }) => {
  await bootstrapOrSignIn(page)
  await page.goto("/salaries")
  await expect(page.getByRole("heading", { name: "اعتماد الأجور الشهرية" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "العامل", exact: true })).toBeVisible()
  await expectNoRawKeys(page)
})

test("reachable workspace pages render no raw i18n keys", async ({ page }) => {
  await bootstrapOrSignIn(page)

  const navPages: Array<[string, string]> = [
    ["لوحة التحكم", "لوحة التحكم"],
    ["العاملون", "العاملون"],
    ["المستودعات", "المستودعات"],
    ["الإعدادات", "الإعدادات"],
  ]
  for (const [navName, heading] of navPages) {
    await page.getByRole("link", { name: navName, exact: true }).first().click()
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 10_000 })
    await expectNoRawKeys(page)
  }

  // Unknown route → translated 404 (detailPages.notFound.* rename, issue #271).
  await page.goto("/definitely-not-a-route")
  await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible()
  await expectNoRawKeys(page)
})
