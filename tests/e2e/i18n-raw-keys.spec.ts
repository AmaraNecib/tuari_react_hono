import { expect, test, type Page } from "@playwright/test"

import { bootstrapOrSignIn, dismissUserJourneyTour } from "./helpers/session"

test.describe.configure({ mode: "serial" })

/**
 * Any text matching a dotted i18n key shape for a known top-level namespace is
 * a leaked raw key (i18next returns the key when the resource lacks it).
 * Issue #271: ~69 call sites rendered raw keys in reachable routes.
 */
const RAW_KEY_PATTERN =
  /(?:^|[\s(“„])(?:common|shell|debts|detailPages|systemLog|inventory|inventoryPage|auth|workspace|appShell|sections|search|license|dashboardPage|dashboard|validation|reports|externals|externalsPage|auditLog|toasts|shortcuts|columns|status|tables|historyEvent|systemRoles|employeeForm|salaries|metrics|mockData|batchOperations|exportImport|debtsHub|debtLedger|debtCases|tour|update)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*(?![\w.])/

async function expectNoRawKeys(page: Page) {
  const bodyText = await page.locator("body").innerText()
  expect(bodyText).not.toMatch(RAW_KEY_PATTERN)
}

test("system-log (transactions) page renders Arabic labels and structured detail chips, no raw keys", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // Navigate to the transactions section (issue #237 system-log page).
  await page.getByRole("link", { name: "سجل المعاملات" }).first().click()

  // The section renders with Arabic column headers from the real resource.
  await expect(page.getByRole("heading", { name: "سجل المعاملات" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "الإجراء" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "التفاصيل" })).toBeVisible()

  // No raw i18n key may leak anywhere on the page.
  await expectNoRawKeys(page)
})

test("debts hub record-payment dialog renders Arabic, no raw keys", async ({ page }) => {
  await dismissUserJourneyTour(page)
  await bootstrapOrSignIn(page)

  // Create an external counterparty with an opening balance so the ledger
  // and record-payment dialog are reachable (empty DB at run start).
  await page.getByRole("link", { name: "الجهات الخارجية" }).first().click()
  await expect(page.getByRole("heading", { name: "الجهات الخارجية" })).toBeVisible()
  await page.getByRole("button", { name: /إضافة جهة خارجية/ }).first().click()
  const counterpartyName = `طرف خارجي ${Date.now().toString(36)}`
  await page.getByLabel("الاسم الكامل").first().fill(counterpartyName)
  await page.getByLabel("رقم الهاتف").first().fill(`07${String(Date.now()).slice(-8)}`)
  await page.getByRole("button", { name: /حفظ الطرف الخارجي/ }).first().click()
  await expect(page.getByRole("heading", { name: counterpartyName })).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder("0 أو 2500 أو -2500").fill("5000")
  await page.getByRole("button", { name: "إنشاء الحساب" }).click()
  await expect(page.getByRole("heading", { name: "تسجيل دفعة على الحساب" })).toBeVisible({ timeout: 15_000 })

  // The debts hub renders translated panel copy — no raw keys.
  await page.getByRole("link", { name: "الديون" }).first().click()
  await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()
  await expectNoRawKeys(page)

  // Open the party's ledger and its record-payment dialog (per-entry “دفعة” button).
  const openButtons = page.getByRole("button", { name: /فتح التفاصيل/ })
  await expect(openButtons.first()).toBeVisible({ timeout: 10_000 })
  await openButtons.first().click()

  const entryPaymentButton = page.getByRole("button", { name: "دفعة", exact: true }).first()
  await expect(entryPaymentButton).toBeVisible({ timeout: 10_000 })
  await entryPaymentButton.click()

  // The dialog shows translated copy (debts.payment.*), not raw keys.
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "تسديد دفعة" })).toBeVisible()
  await expect(dialog.getByText("سجل دفعة مقابل حركة الفتح هذه")).toBeVisible()
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
