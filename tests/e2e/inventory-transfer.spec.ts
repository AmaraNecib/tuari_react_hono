import { installManagedApiLifecycle } from "./helpers/test"
import { expect, test } from "./helpers/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"

installManagedApiLifecycle()


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

// The item/warehouse definitions created in setup tests, reused by later
// tests. Hoisted to module scope so selectors can use their unique labels.
let createdItemName = ""
let warehouseAName = ""
let warehouseBName = ""

test.beforeAll(async () => {
  await resetE2eDatabase()
})

test.describe("inventory transfer — critical path", () => {
  test("admin creates a consumable item definition", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await page.getByRole("button", { name: "دليل العناصر", exact: true }).click()
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

    await page.goto("/invoices/create")
    const editor = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
    await editor.getByRole("combobox", { name: "العنصر", exact: true }).selectOption({ label: `${createdItemName} · مادة` })
    await editor.getByRole("combobox", { name: "الوجهة الافتراضية", exact: true }).selectOption({ label: warehouseAName })
    await editor.getByLabel("كمية المخزون", { exact: true }).fill("10")
    await editor.getByLabel("سعر الوحدة", { exact: true }).fill("1500")
    await editor.getByLabel("رقم الفاتورة، اختياري", { exact: true }).fill("TRANSFER-PURCHASE")
    await editor.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true }).click()
    await expect(editor).toBeHidden()
    const purchase = page.getByRole("region", { name: "جدول فواتير المخزون" }).getByRole("row").filter({ hasText: "TRANSFER-PURCHASE" })
    await expect(purchase).toContainText("15,000")
    await expect(page.getByRole("heading", { name: createdItemName, exact: true })).toBeVisible()
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

    await page.getByRole("button", { name: "تحويل مخزون أو بيع", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeVisible()

    const dialog = page.getByRole("dialog", { name: "تحويل مخزون أو بيع", exact: true })
    await dialog.getByRole("combobox", { name: "المخزون المختار", exact: true }).selectOption({ label: `${createdItemName} · 10` })
    await dialog.getByLabel("الكمية المحولة", { exact: true }).fill("5")
    await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption({ label: warehouseBName })
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

    await page.getByRole("link", { name: "المستودعات", exact: true }).first().click()
    const warehouse = page.getByRole("row", { name: new RegExp(warehouseAName) })
    await warehouse.getByRole("button", { name: "عرض", exact: true }).click()
    await page.getByRole("tab", { name: "سجل التحويلات", exact: true }).click()

    // The internal transfer row shows the type and the transferred quantity.
    // (getByText("تحويل داخلي") alone would match the transfer-type filter's
    // hidden <option> first, so anchor on the quantity-bearing row.)
    const quantityBadge = page.getByText("×5").first()
    await expect(quantityBadge).toBeVisible({ timeout: 10_000 })
    const transferCard = quantityBadge.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
    await expect(transferCard).toContainText("تحويل داخلي")
  })
})
