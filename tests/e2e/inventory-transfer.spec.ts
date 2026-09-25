import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

// The item/warehouse definitions created in setup tests, reused by later
// tests. Hoisted to module scope so selectors can use their unique labels.
let createdItemName = ""
let warehouseAName = ""
let warehouseBName = ""

test.beforeAll(() => {
  resetE2eDatabase()
})

test.describe("inventory transfer — critical path", () => {
  test("admin creates a consumable item definition", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()

    const itemName = `صنف-${uniqueSuffix()}`
    createdItemName = itemName

    await page.getByLabel("اسم العنصر").fill(itemName)
    // CONSUMABLE items require a unit of measure before the button enables.
    await page.getByLabel("وحدة القياس").fill("قطعة")
    await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()

    await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 })
  })

  test("admin creates two warehouses for the transfer", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "المستودعات" }).first().click()
    await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

    const suffix = uniqueSuffix()
    warehouseAName = `مستودع أ ${suffix}`
    warehouseBName = `مستودع ب ${suffix}`

    for (const [name, address] of [
      [warehouseAName, `باب الزوار ${suffix}`],
      [warehouseBName, `الحراش ${suffix}`],
    ] as const) {
      await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
      await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()

      await page.getByLabel("اسم المستودع").fill(name)
      await page.getByLabel(/العنوان/).fill(address)
      await page.getByRole("button", { name: "حفظ المستودع" }).click()

      // The save navigates to the warehouse details page.
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible({ timeout: 10_000 })

      // Back to the warehouses list for the next one.
      await page.getByRole("link", { name: "المستودعات" }).first().click()
      await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()
    }
  })

  test("admin receives items into warehouse A via an invoice with a line item", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "الفواتير" }).first().click()
    await expect(page.getByRole("heading", { name: "الفواتير" })).toBeVisible()

    await page.getByRole("button", { name: "فاتورة جديدة" }).first().click()
    await expect(page.getByRole("heading", { name: /إضافة مخزون بالفاتورة/ })).toBeVisible()

    // Line 1: the item created in the first test, received into warehouse A.
    // Select it by its value (resolved from the option whose text contains the
    // created name), not by index — the option list can shift.
    const itemSelect = page.getByLabel("تعريف العنصر*")
    const itemValue = await itemSelect
      .locator("option")
      .filter({ hasText: createdItemName })
      .getAttribute("value")
    await itemSelect.selectOption(itemValue ?? "")
    // The line's warehouse select's accessible name concatenates its options
    // (no space after the label), which distinguishes it from the top
    // "المستودع الافتراضي" combobox.
    await page.getByLabel(/^المستودعالافتراضي/).selectOption({ label: warehouseAName })
    await page.getByLabel(/الكمية/).fill("10")
    await page.getByLabel(/سعر الوحدة/).fill("1500")

    await page.getByRole("button", { name: "حفظ الفاتورة" }).click()

    // The save navigates to the invoice details route. That page currently
    // renders empty (pre-existing bug: home-view.tsx never forwards invoiceId
    // to HomeViewPageContent), so we assert on the invoices list instead.
    await page.getByRole("link", { name: "الفواتير" }).first().click()
    await expect(page.getByRole("heading", { name: "الفواتير" })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("IN-00001")).toBeVisible({ timeout: 10_000 })
  })

  test("warehouse A balance reflects the received quantity", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "المستودعات" }).first().click()
    await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

    const row = page.getByRole("row", { name: new RegExp(warehouseAName) }).first()
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: /^عرض$/ }).click()

    await page.getByRole("tab", { name: "العناصر" }).click()
    await expect(page.getByText("الكمية الحالية: 10")).toBeVisible({ timeout: 10_000 })
  })

  test("admin transfers 5 units from warehouse A to warehouse B", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "المستودعات" }).first().click()
    await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

    const row = page.getByRole("row", { name: new RegExp(warehouseAName) }).first()
    await row.getByRole("button", { name: /^عرض$/ }).click()
    await page.getByRole("tab", { name: "العناصر" }).click()

    await page.getByRole("button", { name: "تحويل" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.getByLabel("الكمية").fill("5")
    // The destination select's accessible name concatenates its options; the
    // destination-TYPE select has a distinct name, so anchor to disambiguate.
    await page.getByLabel(/^الوجهةاختر الوجهة/).selectOption({ label: warehouseBName })
    await page.getByRole("button", { name: "تأكيد التحويل" }).click()

    // Warehouse A drops to 5.
    await expect(page.getByText("الكمية الحالية: 5")).toBeVisible({ timeout: 10_000 })

    // Warehouse B now holds the transferred 5.
    await page.getByRole("link", { name: "المستودعات" }).first().click()
    const rowB = page.getByRole("row", { name: new RegExp(warehouseBName) }).first()
    await rowB.getByRole("button", { name: /^عرض$/ }).click()
    await page.getByRole("tab", { name: "العناصر" }).click()
    await expect(page.getByText("الكمية الحالية: 5")).toBeVisible({ timeout: 10_000 })
  })

  test("the transfer movement is visible in the transfer history", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "سجل التحويلات" }).first().click()
    await expect(page.getByRole("heading", { name: /سجل التحويلات/ })).toBeVisible()

    // The internal transfer row shows the type and the transferred quantity.
    // (getByText("تحويل داخلي") alone would match the transfer-type filter's
    // hidden <option> first, so anchor on the quantity-bearing row.)
    const quantityBadge = page.getByText("×5").first()
    await expect(quantityBadge).toBeVisible({ timeout: 10_000 })
    const transferCard = quantityBadge.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
    await expect(transferCard).toContainText("تحويل داخلي")
  })
})
