import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

test.beforeAll(() => {
  resetE2eDatabase()
})

let counterpartyName = ""

test.describe("debt entry — critical path", () => {
  test("admin creates an external counterparty and opens a debt we owe them", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "الديون" }).first().click()
    await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()

    const suffix = uniqueSuffix()
    counterpartyName = `طرف خارجي ${suffix}`
    // Derive the phone from every character of the same per-attempt suffix as
    // the name so retries cannot reuse a fixed fallback phone.
    const phoneSalt = Array.from(suffix).reduce(
      (hash, character) => (hash * 31 + character.charCodeAt(0)) % 90_000_000,
      0,
    )
    const phone = `07${String(phoneSalt).padStart(8, "0")}`

    await page.getByRole("link", { name: "الجهات الخارجية" }).first().click()
    await expect(page.getByRole("heading", { name: "الجهات الخارجية" })).toBeVisible()
    await page.getByRole("button", { name: /إضافة جهة خارجية/ }).first().click()
    await expect(page.getByRole("heading", { name: /إضافة جهة خارجية/ })).toBeVisible()

    await page.getByLabel("الاسم الكامل").first().fill(counterpartyName)
    await page.getByLabel("رقم الهاتف").first().fill(phone)
    await page.getByRole("button", { name: /حفظ الطرف الخارجي/ }).first().click()

    // Land on the counterparty details page and record an opening debt balance
    // (PAYABLE direction + positive amount = we owe them).
    await expect(page.getByRole("heading", { name: counterpartyName })).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder("0 أو 2500").fill("5000")
    await page.getByRole("button", { name: "تسجيل دين" }).click()

    // The account is reflected once the feature-scoped useDebtPartyDetailQuery
    // refetch completes (issue #177 Phase 4 debts migration).
    await expect(
      page.getByRole("heading", { name: "تسجيل دفعة على الحساب" }),
    ).toBeVisible({ timeout: 15_000 })

    // The ledger shows the opening entry fetched by the same query.
    await expect(
      page.getByRole("cell", { name: /رصيد افتتاحي/ }).first(),
    ).toBeVisible({ timeout: 15_000 })

    // #459: the same form now posts a payment on the account it just created
    // instead of opening a second account. The opening entry is dated at the
    // start of today, so this payment shares that day and is not backdated.
    await page.getByPlaceholder("0 أو 2500").fill("500")
    await page.getByRole("button", { name: "تسجيل دفعة", exact: true }).first().click()
    await expect(page.getByText(/4,500/).first()).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole("cell", { name: /دفعة/ }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // The debts hub reflects the new party and its balance (PAYABLE 4,500
    // renders as "مستحق علينا دج 4,500" — we owe the counterparty). Scope to
    // the party's row so the amount can't match unrelated page text.
    await page.getByRole("link", { name: "الديون" }).first().click()
    await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()
    const hubRow = page.getByRole("row", { name: new RegExp(counterpartyName) }).first()
    await expect(hubRow).toBeVisible({ timeout: 10_000 })
    await expect(hubRow).toContainText("مستحق علينا")
    await expect(hubRow).toContainText(/4,500/)
    // Regression guard for the reported bug: a balance never renders signed.
    await expect(hubRow).not.toContainText(/-5\s?000/)
  })

  test("admin records a partial payment and the balance drops by the paid amount", async ({ page }) => {
    await bootstrapOrSignIn(page)

    // Reuse the counterparty created in the first test (serial mode).
    await page.getByRole("link", { name: "الديون" }).first().click()
    await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()

    // Open the first external row in the hub.
    const openButtons = page.getByRole("button", { name: /فتح التفاصيل/ })
    await expect(openButtons.first()).toBeVisible({ timeout: 10_000 })
    await openButtons.first().click()

    // Record a payment on the OPENING entry (live entries show a payment button).
    await expect(page.getByRole("heading", { name: /دفتر الدين/ })).toBeVisible({ timeout: 10_000 })
    const payButton = page.getByRole("button", { name: "دفعة", exact: true }).first()
    await expect(payButton).toBeVisible({ timeout: 10_000 })
    await payButton.click()

    // The record-payment dialog subtracts from the balance.
    await expect(page.getByRole("heading", { name: "تسديد دفعة" })).toBeVisible()
    const paymentAmount = page.getByPlaceholder("أدخل المبلغ المدفوع").first()
    await paymentAmount.fill("2000")
    await page.getByRole("button", { name: "تأكيد الدفعة" }).click()

    // The ledger refreshes (debtsDetail invalidation → useDebtPartyDetailQuery)
    // and the balance drops from 4,500 to 2,500 after the 2,000 payment. The
    // balance is shown as the direction phrase plus a positive amount.
    await expect(page.getByText("مستحق علينا").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/2,500/).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/-2,500/)).toHaveCount(0)
    await expect(
      page.getByRole("cell", { name: /دفعة/ }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // The hub must reflect the reduced balance after the detail mutation.
    await page.getByRole("link", { name: "الديون" }).first().click()
    await expect(page.getByRole("heading", { name: "مركز الديون" })).toBeVisible()
    const hubRow = page.getByRole("row", { name: new RegExp(counterpartyName) }).first()
    await expect(hubRow).toBeVisible({ timeout: 10_000 })
    await expect(hubRow).toContainText("مستحق علينا")
    await expect(hubRow).toContainText(/2,500/)
    await expect(hubRow).not.toContainText(/-2\s?500/)
  })
})
