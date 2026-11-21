import { installManagedApiLifecycle, expect, test, type Page } from "./helpers/test"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()
test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })
let itemName = ""
let warehouseName = ""
let counterpartyName = ""
let mixedItemA = ""
let mixedItemB = ""
let alternateWarehouse = ""
const wholeInvoiceDisclosure = "مبالغ الفاتورة كاملة، وليست قيمة الأصناف المعروضة"
const sections = ["تسجيل الشراء كدين على الشركة", "الطرف الخارجي", "الوجهة الافتراضية", "ملاحظات"]

test.describe("inventory invoice create — progressive disclosure", () => {
  test.beforeAll(async () => { await resetE2eDatabase() })

  test("create the actual item definition, warehouse and external counterparty", async ({ page }) => {
    await bootstrapOrSignIn(page)
    itemName = `صنف إفصاح ${uniqueSuffix()}`
    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await page.getByRole("button", { name: "دليل العناصر", exact: true }).click()
    await page.getByLabel("اسم العنصر").fill(itemName)
    await page.getByLabel("وحدة القياس").fill("قطعة")
    await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()
    await expect(page.getByText(itemName)).toBeVisible()
    warehouseName = `مستودع إفصاح ${uniqueSuffix()}`
    await page.getByRole("link", { name: "المستودعات", exact: true }).first().click()
    await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
    await page.getByLabel(/اسم/).first().fill(warehouseName)
    await page.getByRole("button", { name: "حفظ المستودع" }).click()
    await expect(page.getByRole("heading", { name: warehouseName, exact: true })).toBeVisible()
    counterpartyName = `مورد إفصاح ${uniqueSuffix()}`
    await page.getByRole("link", { name: "الجهات الخارجية" }).first().click()
    await page.getByRole("button", { name: /إضافة جهة خارجية/ }).first().click()
    await page.getByLabel("الاسم الكامل").first().fill(counterpartyName)
    await page.getByLabel("رقم الهاتف").first().fill(`07${String(Date.now()).slice(-8)}`)
    await page.getByRole("button", { name: /حفظ الطرف الخارجي/ }).first().click()
    await expect(page.getByRole("heading", { name: counterpartyName, exact: true })).toBeVisible()
  })

  test("number, date and direct line selection are visible while all optional controls are unmounted", async ({ page }) => {
    await bootstrapOrSignIn(page)
    await page.goto("/invoices/create")
    const editor = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
    await expect(editor.getByLabel("رقم الفاتورة، اختياري", { exact: true })).toBeVisible()
    await expect(editor.getByLabel("تاريخ الفاتورة", { exact: true })).toBeVisible()
    await expect(editor.getByRole("combobox", { name: "العنصر", exact: true })).toBeVisible()
    await expect(editor.getByLabel("كمية المخزون", { exact: true })).toBeVisible()
    for (const name of sections) await expect(editor.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "false")
    await expect(editor.getByRole("checkbox", { name: sections[0], exact: true })).toHaveCount(0)
    await expect(editor.getByRole("combobox", { name: "الطرف الخارجي", exact: true })).toHaveCount(0)
    await expect(editor.getByRole("textbox", { name: "اسم المورد", exact: true })).toHaveCount(0)
    await expect(editor.getByRole("combobox", { name: "الوجهة الافتراضية", exact: true })).toHaveCount(0)
    await expect(editor.getByLabel("ملاحظة", { exact: true })).toHaveCount(0)
    await expect(editor.getByLabel("ملفات الفاتورة", { exact: true })).toHaveCount(0)
  })

  test("all expanded sections retain state and persist exact debt, inherited lines, supplier and attachment", async ({ page }) => {
    await bootstrapOrSignIn(page)
    await page.goto("/invoices/create")
    const editor = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
    const number = `DISCLOSURE-${uniqueSuffix()}`
    await editor.getByLabel("رقم الفاتورة، اختياري", { exact: true }).fill(number)
    for (const name of sections) {
      const toggle = editor.getByRole("button", { name, exact: true })
      await expect(toggle).toHaveAttribute("aria-expanded", "false")
      await toggle.click()
      await expect(toggle).toHaveAttribute("aria-expanded", "true")
    }
    const debt = editor.getByRole("checkbox", { name: sections[0], exact: true })
    await debt.check()
    // #591 owns CASH/BANK/CHECK. AMOUNT below is an input mode, not a payment method.
    await editor.getByRole("combobox", { name: "إدخال الدفعة الأولى", exact: true }).selectOption("AMOUNT")
    await editor.getByLabel("الدفعة الأولى، اختياري", { exact: true }).fill("500")
    const party = editor.getByRole("combobox", { name: "الطرف الخارجي", exact: true })
    await party.selectOption({ label: counterpartyName })
    await expect(party.locator("option:checked")).toHaveText(counterpartyName)
    const supplier = editor.getByRole("textbox", { name: "اسم المورد", exact: true })
    await expect(supplier).toHaveValue(counterpartyName)
    await expect(supplier).toHaveAttribute("readonly", "")
    const defaults = editor.getByRole("combobox", { name: "الوجهة الافتراضية", exact: true })
    await defaults.selectOption({ label: warehouseName })
    await expect(defaults.locator("option:checked")).toHaveText(warehouseName)
    const notes = editor.getByRole("region", { name: "ملاحظات", exact: true })
    const note = notes.getByRole("textbox", { name: "ملاحظة", exact: true })
    await note.fill("ملاحظة إفصاح تدريجي")
    await expect(note).toHaveValue("ملاحظة إفصاح تدريجي")
    await editor.getByLabel("ملفات الفاتورة", { exact: true }).setInputFiles({
      name: "invoice-note.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    })
    await editor.getByRole("button", { name: "إضافة بند مخزون", exact: true }).click()
    for (const name of sections) await expect(editor.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "true")
    await expect(debt).toBeChecked()
    await expect(editor.getByLabel("الدفعة الأولى، اختياري", { exact: true })).toHaveValue("500")
    await expect(supplier).toHaveValue(counterpartyName)
    await expect(notes).toBeVisible()
    await expect(note).toHaveValue("ملاحظة إفصاح تدريجي")
    const items = editor.getByRole("combobox", { name: "العنصر", exact: true })
    await expect(items).toHaveCount(2)
    for (let index = 0; index < 2; index++) {
      await items.nth(index).selectOption({ label: `${itemName} · مادة` })
      await editor.getByLabel("كمية المخزون", { exact: true }).nth(index).fill("10")
      await editor.getByLabel("سعر الوحدة", { exact: true }).nth(index).fill("100")
    }
    await editor.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByRole("heading", { name: `تفاصيل ${number}`, exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: itemName, level: 3, exact: true })).toHaveCount(2)
    await expect(page.getByRole("link", { name: "invoice-note.png", exact: true })).toBeVisible()

    const db = loadDatabaseConstructor()(findE2eDatabase())
    let groupId = ""
    try {
      db.pragma("query_only = ON")
      const cp = db.prepare("SELECT id FROM external_counterparty WHERE full_name = ?").get(counterpartyName) as { id: string }
      const warehouse = db.prepare("SELECT id FROM warehouse WHERE name = ?").get(warehouseName) as { id: string }
      expect(cp).toBeDefined()
      expect(warehouse).toBeDefined()
      const group = db.prepare(`SELECT id, supplier_name, external_counterparty_id, warehouse_id, project_id, note,
        CAST(gross_total_minor AS TEXT) AS gross, CAST(paid_amount_minor AS TEXT) AS paid,
        CAST(remaining_debt_minor AS TEXT) AS remaining FROM inventory_invoice_group WHERE invoice_number = ?`).get(number) as {
        id: string; supplier_name: string; external_counterparty_id: string; warehouse_id: string; project_id: string | null; note: string; gross: string; paid: string; remaining: string
      }
      expect(group).toBeDefined()
      groupId = group.id
      expect(group).toMatchObject({ supplier_name: counterpartyName, external_counterparty_id: cp.id,
        warehouse_id: warehouse.id, project_id: null, note: "ملاحظة إفصاح تدريجي", gross: "200000", paid: "50000", remaining: "150000" })
      const rows = db.prepare("SELECT warehouse_id, project_id FROM inventory_entry WHERE invoice_group_id = ? ORDER BY entry_order").all(groupId)
      expect(rows).toEqual([{ warehouse_id: warehouse.id, project_id: null }, { warehouse_id: warehouse.id, project_id: null }])
      const attachments = db.prepare("SELECT original_name FROM inventory_invoice_attachment WHERE invoice_group_id = ?").all(groupId)
      expect(attachments).toEqual([{ original_name: "invoice-note.png" }])
    } finally { db.close() }
    await page.goto(`/invoices/${groupId}`)
    await expect(page.getByRole("heading", { name: `تفاصيل ${number}`, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "invoice-note.png", exact: true })).toBeVisible()
    const history = page.getByRole("region", { name: "سجل الحركات", exact: true })
    const movements = history.getByRole("article")
      .filter({ has: page.getByRole("heading", { name: itemName, level: 4, exact: true }) })
      .filter({ hasText: `مستودع: ${warehouseName}` })
      .filter({ has: page.locator('bdi[dir="ltr"]').filter({ hasText: /^×10$/ }) })
    await expect(history).toBeVisible()
    await expect(movements).toHaveCount(2)
    for (let index = 0; index < 2; index++) {
      await expect(movements.nth(index)).toBeVisible()
      await expect(movements.nth(index)).toContainText("شراء")
      await expect(movements.nth(index)).toContainText(`مستودع: ${warehouseName}`)
      await expect(movements.nth(index).locator('bdi[dir="ltr"]').filter({ hasText: /^×10$/ })).toBeVisible()
    }
    await expect(page.getByRole("button", { name: "العودة إلى الفواتير", exact: true })).toBeVisible()
  })

  test("create distinct mixed-history items and a second destination through the real forms", async ({ page }) => {
    await bootstrapOrSignIn(page)
    mixedItemA = `صنف مختلط أ ${uniqueSuffix()}`
    mixedItemB = `صنف مختلط ب ${uniqueSuffix()}`
    for (const name of [mixedItemA, mixedItemB]) {
      await page.getByRole("link", { name: "دليل العناصر" }).first().click()
      await page.getByRole("button", { name: "دليل العناصر", exact: true }).click()
      await page.getByLabel("اسم العنصر").fill(name)
      await page.getByLabel("وحدة القياس").fill("قطعة")
      await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()
      await expect(page.getByText(name, { exact: true })).toBeVisible()
    }
    alternateWarehouse = `مستودع مختلط ب ${uniqueSuffix()}`
    await page.getByRole("link", { name: "المستودعات", exact: true }).first().click()
    await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
    await page.getByLabel("اسم المستودع", { exact: true }).fill(alternateWarehouse)
    await page.getByRole("button", { name: "حفظ المستودع" }).click()
    await expect(page.getByRole("heading", { name: alternateWarehouse, exact: true })).toBeVisible()
  })

  test("saved mixed purchase owns both global destinations but only each location's incoming units", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const number = `MIXED-${uniqueSuffix()}`
    await saveHistoryInvoice(page, number, false)
    await page.getByRole("link", { name: "سجل التحويلات", exact: true }).first().click()
    await expect(page.getByText("يتضمن الإجمالي مبالغ فواتير الشراء كاملة، لا قيمة أصناف الموقع فقط", { exact: true })).toBeVisible()
    // The unique user-entered note belongs directly to the purchase card.
    const row = page.getByText(number, { exact: true }).locator("..")
    await expect(row).toHaveCount(1)
    await expect(row).toContainText("شراء")
    await expect(row.getByText(wholeInvoiceDisclosure, { exact: true })).toBeVisible()
    for (const [name, quantity, destination] of [[mixedItemA, "×2", warehouseName], [mixedItemB, "×4", alternateWarehouse]]) {
      const item = row.getByText(name!, { exact: true }).locator("..")
      await expect(item.getByText(quantity!, { exact: true })).toBeVisible()
      const link = item.getByRole("link", { name: destination!, exact: true })
      await expect(link).toHaveAttribute("href", /^\/warehouses\/[^/]+$/)
    }
    await expect(row.getByRole("link")).toHaveCount(2)
    for (const [label, amount] of [["الإجمالي", "30"], ["المدفوع", "1"], ["الدين", "29"]]) {
      const money = row.getByText(label!, { exact: true }).locator("..")
      await expect(money.locator('bdi[dir="ltr"]')).toHaveText(amount!)
    }
    const destinationA = await row.getByRole("link", { name: warehouseName, exact: true }).getAttribute("href")
    const destinationB = await row.getByRole("link", { name: alternateWarehouse, exact: true }).getAttribute("href")
    expect(destinationA).not.toBe(destinationB)
    for (const [destination, ownItem, otherItem, quantity] of [
      [warehouseName, mixedItemA, mixedItemB, "×2"],
      [alternateWarehouse, mixedItemB, mixedItemA, "×4"],
    ]) {
      await openWarehouseHistory(page, destination!)
      const local = page.getByTestId("location-transfer-history-row").filter({ hasText: ownItem! })
      await expect(local).toHaveCount(1)
      await expect(local).toContainText("شراء")
      await expect(local.getByText("وارد", { exact: true })).toBeVisible()
      await expect(local).not.toContainText(otherItem!)
      await expect(local.locator('bdi[dir="ltr"]')).toHaveText([quantity!, "30.00"])
      await expect(local.getByText(wholeInvoiceDisclosure, { exact: true })).toBeVisible()
    }
  })

  test("a header default with every entry overridden does not create a phantom local purchase", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const number = `OVERRIDE-${uniqueSuffix()}`
    await saveHistoryInvoice(page, number, true)
    await page.getByRole("link", { name: "سجل التحويلات", exact: true }).first().click()
    const global = page.getByText(number, { exact: true }).locator("..")
    await expect(global).toHaveCount(1)
    await expect(global.getByRole("link", { name: warehouseName, exact: true })).toHaveCount(0)
    // The single destination appears once in the route and once per entry.
    await expect(global.getByRole("link", { name: `مستودع: ${alternateWarehouse}`, exact: true })).toBeVisible()
    await expect(global.getByRole("link", { name: alternateWarehouse, exact: true })).toHaveCount(2)
    await openWarehouseHistory(page, alternateWarehouse)
    const purchasesB = page.getByTestId("location-transfer-history-row").filter({ hasText: mixedItemA })
    await expect(purchasesB).toHaveCount(1)
    await expect(purchasesB).toContainText(mixedItemB)
    await expect(purchasesB.getByText("وارد", { exact: true })).toBeVisible()
    await expect(purchasesB.locator('bdi[dir="ltr"]')).toHaveText(["×2", "×4", "30.00"])
    await expect(purchasesB.getByText(wholeInvoiceDisclosure, { exact: true })).toBeVisible()
    await openWarehouseHistory(page, warehouseName)
    // A still has the earlier mixed purchase, not a second purchase from the header.
    const purchasesA = page.getByTestId("location-transfer-history-row").filter({ hasText: mixedItemA })
    await expect(purchasesA).toHaveCount(1)
    await expect(purchasesA).not.toContainText(mixedItemB)
    await expect(purchasesA.locator('bdi[dir="ltr"]')).toHaveText(["×2", "30.00"])
    await expect(page.getByTestId("location-transfer-history-row").filter({ hasText: mixedItemB })).toHaveCount(0)
  })
})

async function openWarehouseHistory(page: Page, name: string) {
  await page.getByRole("link", { name: "المستودعات", exact: true }).first().click()
  const warehouse = page.getByRole("row").filter({ hasText: name })
  await warehouse.getByRole("button", { name: "عرض", exact: true }).click()
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "سجل التحويلات", exact: true }).click()
}

async function saveHistoryInvoice(page: Page, number: string, allEntriesAtB: boolean) {
  await page.goto("/invoices/create")
  const editor = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
  await editor.getByLabel("رقم الفاتورة، اختياري", { exact: true }).fill(number)
  for (const name of sections) await editor.getByRole("button", { name, exact: true }).click()
  await editor.getByRole("checkbox", { name: sections[0], exact: true }).check()
  await editor.getByRole("combobox", { name: "إدخال الدفعة الأولى", exact: true }).selectOption("AMOUNT")
  await editor.getByLabel("الدفعة الأولى، اختياري", { exact: true }).fill("1")
  await editor.getByRole("combobox", { name: "الطرف الخارجي", exact: true }).selectOption({ label: counterpartyName })
  await editor.getByRole("combobox", { name: "الوجهة الافتراضية", exact: true }).selectOption({ label: warehouseName })
  await editor.getByLabel("ملاحظة", { exact: true }).fill(number)
  await editor.getByRole("button", { name: "إضافة بند مخزون", exact: true }).click()
  for (const [index, name] of [mixedItemA, mixedItemB].entries()) {
    await editor.getByRole("combobox", { name: "العنصر", exact: true }).nth(index).selectOption({ label: `${name} · مادة` })
    await editor.getByLabel("كمية المخزون", { exact: true }).nth(index).fill(index === 0 ? "2" : "4")
    await editor.getByLabel("سعر الوحدة", { exact: true }).nth(index).fill("5.0000")
    if (index === 1 || allEntriesAtB) await editor.getByRole("combobox", { name: "وجهة البند", exact: true }).nth(index).selectOption({ label: alternateWarehouse })
  }
  await editor.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByRole("heading", { name: `تفاصيل ${number}`, exact: true })).toBeVisible()
}
