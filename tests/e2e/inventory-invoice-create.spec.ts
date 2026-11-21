import { installManagedApiLifecycle, expect, test } from "./helpers/test"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()
test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })
let warehouseName = ""
let alternateWarehouseName = ""
let itemName = ""

function warehouseId(name: string) {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    db.pragma("query_only = ON")
    const row = db.prepare("SELECT id FROM warehouse WHERE name = ?").get(name) as { id: string } | undefined
    expect(row).toBeDefined()
    return row!.id
  } finally { db.close() }
}

test.describe("inventory invoice create — header default warehouse persistence and seeding", () => {
  test.beforeAll(async () => { await resetE2eDatabase() })

  test("admin creates a consumable item and warehouses for inherited and explicit destinations", async ({ page }) => {
    await bootstrapOrSignIn(page)
    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await page.getByRole("button", { name: "دليل العناصر", exact: true }).click()
    await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()
    itemName = `صنف فاتورة ${uniqueSuffix()}`
    await page.getByLabel("اسم العنصر").fill(itemName)
    await page.getByLabel("وحدة القياس").fill("قطعة")
    await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()
    await expect(page.getByText(itemName)).toBeVisible()
    warehouseName = `مستودع فاتورة ${uniqueSuffix()}`
    alternateWarehouseName = `مستودع بديل ${uniqueSuffix()}`
    for (const name of [warehouseName, alternateWarehouseName]) {
      await page.getByRole("link", { name: "المستودعات", exact: true }).first().click()
      await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
      await page.getByLabel(/اسم/).first().fill(name)
      await page.getByRole("button", { name: "حفظ المستودع" }).click()
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
    }
  })

  test("the header default persists, preserves an explicit override and seeds both unset lines", async ({ page }) => {
    await bootstrapOrSignIn(page)
    await page.goto("/invoices/create")
    const editor = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
    const number = `DEFAULT-${uniqueSuffix()}`
    await editor.getByLabel("رقم الفاتورة، اختياري", { exact: true }).fill(number)
    const defaults = editor.getByRole("button", { name: "الوجهة الافتراضية", exact: true })
    await expect(defaults).toHaveAttribute("aria-expanded", "false")
    await defaults.click()
    const header = editor.getByRole("combobox", { name: "الوجهة الافتراضية", exact: true })
    const target = `WAREHOUSE:${warehouseId(warehouseName)}`
    const alternate = `WAREHOUSE:${warehouseId(alternateWarehouseName)}`
    await header.selectOption({ label: warehouseName })
    await expect(header).toHaveValue(target)
    await expect(header.locator("option:checked")).toHaveText(warehouseName)
    await editor.getByRole("button", { name: "إضافة بند مخزون", exact: true }).click()
    await expect(defaults).toHaveAttribute("aria-expanded", "true")
    await expect(header).toHaveValue(target)
    const destinations = editor.getByRole("combobox", { name: "وجهة البند", exact: true })
    await expect(destinations).toHaveCount(2)
    await destinations.last().selectOption(alternate)
    await header.selectOption(alternate)
    await header.selectOption(target)
    await expect(destinations.first()).toHaveValue(target)
    await expect(destinations.last()).toHaveValue(alternate)
    // Return the explicit line to inheritance before proving both persisted defaults.
    await destinations.last().selectOption("")
    await expect(destinations.last()).toHaveValue(target)
    const items = editor.getByRole("combobox", { name: "العنصر", exact: true })
    for (let index = 0; index < 2; index++) {
      await items.nth(index).selectOption({ label: `${itemName} · مادة` })
      await editor.getByLabel("كمية المخزون", { exact: true }).nth(index).fill("1")
      await editor.getByLabel("سعر الوحدة", { exact: true }).nth(index).fill("1")
    }
    await editor.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByRole("heading", { name: `تفاصيل ${number}`, exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: itemName, level: 3, exact: true })).toHaveCount(2)

    const db = loadDatabaseConstructor()(findE2eDatabase())
    let groupId = ""
    try {
      db.pragma("query_only = ON")
      const group = db.prepare("SELECT id, warehouse_id, project_id, CAST(gross_total_minor AS TEXT) AS gross FROM inventory_invoice_group WHERE invoice_number = ?").get(number) as { id: string; warehouse_id: string; project_id: string | null; gross: string }
      expect(group).toBeDefined()
      groupId = group.id
      expect(group).toMatchObject({ warehouse_id: warehouseId(warehouseName), project_id: null, gross: "200" })
      const rows = db.prepare("SELECT warehouse_id, project_id FROM inventory_entry WHERE invoice_group_id = ? ORDER BY entry_order").all(groupId)
      expect(rows).toEqual([
        { warehouse_id: warehouseId(warehouseName), project_id: null },
        { warehouse_id: warehouseId(warehouseName), project_id: null },
      ])
    } finally { db.close() }
    await page.goto(`/invoices/${groupId}`)
    await expect(page.getByRole("heading", { name: `تفاصيل ${number}`, exact: true })).toBeVisible()
    const history = page.getByRole("region", { name: "سجل الحركات", exact: true })
    await expect(history).toBeVisible()
    const movements = history.getByRole("article")
      .filter({ has: page.getByRole("heading", { name: itemName, level: 4, exact: true }) })
      .filter({ hasText: `مستودع: ${warehouseName}` })
      .filter({ has: page.locator('bdi[dir="ltr"]').filter({ hasText: /^×1$/ }) })
    await expect(movements).toHaveCount(2)
    for (let index = 0; index < 2; index++) {
      await expect(movements.nth(index)).toBeVisible()
      await expect(movements.nth(index)).toContainText("شراء")
      await expect(movements.nth(index)).toContainText(`مستودع: ${warehouseName}`)
      await expect(movements.nth(index).locator('bdi[dir="ltr"]').filter({ hasText: /^×1$/ })).toBeVisible()
    }
    await page.getByRole("button", { name: "العودة إلى الفواتير", exact: true }).click()
    await expect(page).toHaveURL(/\/invoices(?:\?.*)?$/)
    await expect(page.getByRole("heading", { name: "المخزون والمشتريات", exact: true })).toBeVisible()
    const list = page.getByRole("region", { name: "جدول فواتير المخزون", exact: true })
    const returnedPurchase = list.getByRole("row").filter({ has: page.getByRole("cell", { name: number, exact: true }) })
    await expect(returnedPurchase).toHaveCount(1)
    await expect(returnedPurchase).toBeVisible()
    await expect(returnedPurchase.getByRole("button", { name: `تفاصيل ${number}`, exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: `تفاصيل ${number}`, exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "سجل الحركات", exact: true })).toHaveCount(0)
    await expect(page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })).toHaveCount(0)
  })

  test("minimum one direct-selection line explains invalid save and rejects unsupported attachment by name", async ({ page }) => {
    await bootstrapOrSignIn(page)
    await page.goto("/invoices/create")
    const editor = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
    const save = editor.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true })
    const items = editor.getByRole("combobox", { name: "العنصر", exact: true })
    await items.selectOption({ label: `${itemName} · مادة` })
    await expect(items.locator("option:checked")).toHaveText(`${itemName} · مادة`)
    await expect(editor.getByRole("button", { name: "حذف بند المخزون 1", exact: true })).toHaveCount(0)
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription(/أكمل العناصر والكميات والأسعار الصالحة/)
    await editor.getByLabel("سعر الوحدة", { exact: true }).fill("1")
    await expect(save).toBeEnabled()
    await editor.getByRole("button", { name: "إضافة بند مخزون", exact: true }).click()
    await expect(save).toBeDisabled()
    await editor.getByRole("button", { name: "حذف بند المخزون 2", exact: true }).click()
    await expect(items).toHaveCount(1)
    await expect(save).toBeEnabled()
    await expect(editor.getByRole("button", { name: "حذف بند المخزون 1", exact: true })).toHaveCount(0)
    await editor.getByLabel("سعر الوحدة", { exact: true }).fill("-")
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription(/أكمل العناصر والكميات والأسعار الصالحة/)
    await editor.getByLabel("سعر الوحدة", { exact: true }).fill("1")
    const notes = editor.getByRole("button", { name: "ملاحظات", exact: true })
    await notes.click()
    await editor.getByLabel("ملفات الفاتورة", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") })
    await expect(editor.getByRole("alert")).toHaveCount(1)
    await expect(editor.getByRole("alert")).toContainText("notes.txt")
    await expect(editor.getByRole("alert")).toContainText("غير مدعوم")
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription(/notes\.txt/)
    await notes.click()
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription(/notes\.txt/)
  })
})
