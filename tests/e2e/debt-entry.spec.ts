import { installManagedApiLifecycle, expect, test, type Page } from "./helpers/test"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()
test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })
test.beforeAll(async () => { await resetE2eDatabase() })
let counterpartyName = ""

async function openAccount(page: Page) {
  await page.getByRole("link", { name: "الديون", exact: true }).first().click()
  await expect(page.getByRole("heading", { name: "الديون", exact: true })).toBeVisible()
  const account = page.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: new RegExp(counterpartyName) })
  await expect(account).toContainText("مستحقات علينا")
  await account.click()
  return account
}

async function pay(page: Page, amount: string) {
  const opening = page.getByRole("row").filter({ hasText: "رصيد افتتاحي" })
  await opening.getByRole("button", { name: "تسجيل دفعة", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "تسجيل دفعة", exact: true })
  await dialog.getByRole("textbox", { name: "مبلغ الدفعة", exact: true }).fill(amount)
  await dialog.getByRole("button", { name: "تأكيد الحفظ", exact: true }).click()
  await expect(dialog).toBeHidden()
}

test.describe("debt entry — critical path", () => {
  test("admin creates an external counterparty and opens a debt we owe them", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const suffix = uniqueSuffix()
    counterpartyName = `طرف خارجي ${suffix}`
    const salt = Array.from(suffix).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 90_000_000, 0)
    await page.getByRole("link", { name: "الجهات الخارجية" }).first().click()
    await page.getByRole("button", { name: /إضافة جهة خارجية/ }).first().click()
    await page.getByLabel("الاسم الكامل").first().fill(counterpartyName)
    await page.getByLabel("رقم الهاتف").first().fill(`07${String(salt).padStart(8, "0")}`)
    await page.getByRole("button", { name: /حفظ الطرف الخارجي/ }).first().click()
    await expect(page.getByRole("heading", { name: counterpartyName })).toBeVisible()
    await page.getByRole("link", { name: "الديون", exact: true }).first().click()
    await page.getByRole("combobox", { name: "الطرف", exact: true }).selectOption({ label: counterpartyName })
    await page.getByRole("combobox", { name: "اتجاه الحساب", exact: true }).selectOption("PAYABLE")
    await page.getByRole("textbox", { name: "الرصيد الافتتاحي، اختياري", exact: true }).fill("5000")
    await page.getByRole("textbox", { name: "سبب الدين", exact: true }).fill("رصيد افتتاحي للاختبار")
    await page.getByRole("button", { name: "حفظ الحساب", exact: true }).click()
    const account = await openAccount(page)
    await expect(account).toContainText("5,000")
    await expect(page.getByRole("row").filter({ hasText: "رصيد افتتاحي" })).toContainText("5,000")
    await pay(page, "500")
    await expect(account).toContainText("4,500")
    await expect(account).not.toContainText("-4,500")
    await expect(page.getByRole("row").filter({ has: page.getByRole("cell", { name: /^دفعة/ }) })).toHaveCount(1)
    await page.reload()
    const persisted = await openAccount(page)
    await expect(persisted).toContainText("4,500")
  })

  test("admin records a partial payment and the balance drops by the paid amount", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const account = await openAccount(page)
    await expect(account).toContainText("4,500")
    await pay(page, "2000")
    await expect(account).toContainText("2,500")
    await expect(account).toContainText("مستحقات علينا")
    await expect(account).not.toContainText("-2,500")
    const opening = page.getByRole("row").filter({ hasText: "رصيد افتتاحي" })
    await expect(opening).toContainText("2,500")
    await expect(page.getByRole("row").filter({ has: page.getByRole("cell", { name: /^دفعة/ }) })).toHaveCount(2)
    await page.reload()
    await expect(await openAccount(page)).toContainText("2,500")
  })

  test("ledger previews grouped decimal payments and persists them as PAYMENT entries", async ({ page }, testInfo) => {
    await bootstrapOrSignIn(page)
    await openAccount(page)
    await page.getByRole("row").filter({ hasText: "رصيد افتتاحي" }).getByRole("button", { name: "تسجيل دفعة", exact: true }).click()
    const form = page.getByRole("dialog", { name: "تسجيل دفعة", exact: true })
    const amount = form.getByRole("textbox", { name: "مبلغ الدفعة", exact: true })
    await amount.fill("20 00.50")
    await amount.blur()
    await expect(form.getByRole("button", { name: "تأكيد الحفظ", exact: true })).toBeDisabled()
    await expect(amount).toHaveAttribute("aria-invalid", "true")
    await form.screenshot({ path: testInfo.outputPath("ledger-invalid-grouping.png") })
    await amount.fill("2 000.50")
    // Preserve the preview contract until its missing exact-screen equivalent is resolved.
    const preview = form.getByLabel("معاينة الدفعة")
    await expect(preview).toContainText("2,000.5")
    await expect(preview).toContainText("499.5")
    await expect(amount).toHaveValue("2 000.50")
    await form.screenshot({ path: testInfo.outputPath("ledger-payment-preview.png") })
    await form.getByRole("button", { name: "تأكيد الحفظ", exact: true }).click()
    await expect(form).toBeHidden()
    const paymentRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: /-2,000.5/ }) })
    await expect(paymentRow).toContainText("دفعة")
    await expect(paymentRow).toContainText("499.5")
    await expect(await openAccount(page)).toContainText("499.5")
  })
})
