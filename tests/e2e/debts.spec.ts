import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates an external counterparty and it shows in the debts hub", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "الديون" }).first().click()
  await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()

  const counterpartyName = `طرف خارجي ${uniqueSuffix()}`
  const phone = `07${Math.floor(10000000 + Math.random() * 89999999)}`

  // Create the counterparty from the externals page
  await page.getByRole("link", { name: "الجهات الخارجية" }).first().click()
  await expect(page.getByRole("heading", { name: "الجهات الخارجية" })).toBeVisible()
  await page.getByRole("button", { name: /إضافة جهة خارجية/ }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة جهة خارجية/ })).toBeVisible()

  await page.getByLabel("الاسم الكامل").first().fill(counterpartyName)
  await page.getByLabel("رقم الهاتف").first().fill(phone)
  await page.getByRole("button", { name: /حفظ الطرف الخارجي/ }).first().click()

  // Land on the counterparty details page and record an opening debt balance
  await expect(page.getByRole("heading", { name: counterpartyName })).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder("0 أو 2500 أو -2500").fill("5000")
  await page.getByRole("button", { name: "إنشاء الحساب" }).click()

  // The account is reflected once the feature-scoped useDebtPartyDetailQuery
  // refetch completes (issue #177 Phase 4 debts migration).
  await expect(
    page.getByRole("heading", { name: "تسجيل دفعة على الحساب" }),
  ).toBeVisible({ timeout: 15_000 })

  // The ledger shows the opening entry fetched by the same query.
  await expect(
    page.getByRole("cell", { name: /رصيد افتتاحي/ }).first(),
  ).toBeVisible({ timeout: 15_000 })

  // The debts hub reflects the new party and its balance (PAYABLE +5000
  // renders as "دج -5000" — we owe the counterparty).
  await page.getByRole("link", { name: "الديون" }).first().click()
  await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()
  await expect(page.getByText(counterpartyName)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/5\s?000/).first()).toBeVisible()
})

test("admin can record a payment and settle a debt account", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // Reuse the counterparty created in the first test (serial mode)
  await page.getByRole("link", { name: "الديون" }).first().click()
  await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()

  // Open the first external row in the hub
  const openButtons = page.getByRole("button", { name: /فتح التفاصيل/ })
  await expect(openButtons.first()).toBeVisible({ timeout: 10_000 })
  await openButtons.first().click()

  // Record a payment on the OPENING entry (live entries show a payment button)
  await expect(page.getByRole("heading", { name: /دفتر الدين/ })).toBeVisible({ timeout: 10_000 })
  const payButton = page.getByRole("button", { name: "دفعة", exact: true }).first()
  await expect(payButton).toBeVisible({ timeout: 10_000 })
  await payButton.click()

  // The record-payment dialog subtracts from the balance
  await expect(page.getByRole("heading", { name: "تسديد دفعة" })).toBeVisible()
  const paymentAmount = page.getByPlaceholder("أدخل المبلغ المدفوع").first()
  await paymentAmount.fill("2000")
  await page.getByRole("button", { name: "تأكيد الدفعة" }).click()

  // The ledger refreshes (debtsDetail invalidation → useDebtPartyDetailQuery)
  // and the balance drops from +5000 to +3000 after the 2000 payment.
  await expect(page.getByText(/\+3000/).first()).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByRole("cell", { name: /دفعة/ }).first(),
  ).toBeVisible({ timeout: 10_000 })
})
