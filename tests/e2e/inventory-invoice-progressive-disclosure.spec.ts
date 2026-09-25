import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

let itemName = ""
let warehouseName = ""
let counterpartyName = ""

// Issue #25: the invoice create form must use progressive disclosure. The
// essential path (invoice number, date, line grid) is visible immediately;
// the debt, counterparty/supplier, default warehouse/project, and notes/files
// fields stay hidden inside collapsible sections until opened. A full create
// with every section expanded must still work and land on the details view.
test.describe("inventory invoice create — progressive disclosure", () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test("seed an item definition, a warehouse and an external counterparty", async ({ page }) => {
    await bootstrapOrSignIn(page)

    itemName = `صنف إفصاح ${uniqueSuffix()}`
    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()
    await page.getByLabel("اسم العنصر").fill(itemName)
    await page.getByLabel("وحدة القياس").fill("قطعة")
    await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()
    await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 })

    warehouseName = `مستودع إفصاح ${uniqueSuffix()}`
    await page.getByRole("link", { name: "المستودعات" }).first().click()
    await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()
    await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
    await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()
    await page.getByLabel(/اسم/).first().fill(warehouseName)
    await page.getByRole("button", { name: "حفظ المستودع" }).click()
    await expect(page.getByText(warehouseName)).toBeVisible({ timeout: 10_000 })

    counterpartyName = `مورد إفصاح ${uniqueSuffix()}`
    await page.getByRole("link", { name: "الجهات الخارجية" }).first().click()
    await expect(page.getByRole("heading", { name: "الجهات الخارجية" })).toBeVisible()
    await page.getByRole("button", { name: /إضافة جهة خارجية/ }).first().click()
    await page.getByLabel("الاسم الكامل").first().fill(counterpartyName)
    await page.getByLabel("رقم الهاتف").first().fill(`07${String(Date.now()).slice(-8)}`)
    await page.getByRole("button", { name: /حفظ الطرف الخارجي/ }).first().click()
    await expect(page.getByRole("heading", { name: counterpartyName })).toBeVisible({ timeout: 10_000 })
  })

  test("the essential path shows only number/date/grid; option fields are hidden until opened", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.goto("/invoices/create")
    await expect(page.getByRole("heading", { name: "إضافة مخزون بالفاتورة" })).toBeVisible()

    // Essential create path: invoice number and date visible with no interaction.
    await expect(page.locator("label").filter({ hasText: "رقم الفاتورة" })).toBeVisible()
    await expect(page.locator("label").filter({ hasText: "تاريخ الفاتورة" })).toBeVisible()
    // The line-item grid is visible too.
    await expect(page.getByLabel("تعريف العنصر")).toBeVisible()

    // All four sections are collapsed by default.
    for (const name of ["الدين والدفع", "ربط بجهة خارجية", "المستودع والمشروع الافتراضي", "ملاحظات وملفات"]) {
      await expect(page.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false")
    }

    // Debt, counterparty/supplier, defaults, and notes/files fields are not in
    // the DOM at all until their section is opened (conditional rendering, so
    // they are neither visible nor focusable).
    await expect(page.getByLabel("هل هذه دين؟")).toHaveCount(0)
    await expect(page.locator("label").filter({ hasText: "الجهة الخارجية" })).toHaveCount(0)
    await expect(page.locator("label").filter({ hasText: "اسم المورد" })).toHaveCount(0)
    await expect(page.locator("label").filter({ hasText: "المستودع الافتراضي" })).toHaveCount(0)
    await expect(page.locator("label").filter({ hasText: "المشروع الافتراضي" })).toHaveCount(0)
    await expect(page.getByLabel("ملاحظة")).toHaveCount(0)
    await expect(page.locator("label").filter({ hasText: "ملفات الفاتورة" })).toHaveCount(0)
  })

  test("a full create works with every section expanded and stays expanded across a line-item re-render", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.goto("/invoices/create")
    await expect(page.getByRole("heading", { name: "إضافة مخزون بالفاتورة" })).toBeVisible()

    // 1) Debt section: mark as debt — payment method + paid-now appear.
    const debtSection = page.getByRole("button", { name: "الدين والدفع" })
    await debtSection.click()
    await expect(debtSection).toHaveAttribute("aria-expanded", "true")
    const debtSelect = page.getByLabel("هل هذه دين؟")
    await expect(debtSelect).toBeVisible()
    await debtSelect.selectOption("YES")
    await expect(page.getByLabel("طريقة الدفع")).toBeVisible()
    await page.getByLabel("المدفوع الآن").fill("500")

    // 2) Counterparty section: pick the seeded counterparty; the supplier name
    // auto-seeds from it.
    const cpSection = page.getByRole("button", { name: "ربط بجهة خارجية" })
    await cpSection.click()
    await expect(cpSection).toHaveAttribute("aria-expanded", "true")
    const cpField = page.locator("label").filter({ hasText: "الجهة الخارجية" })
    const cpTrigger = cpField.locator("[role=combobox]")
    await cpTrigger.click()
    await page.locator('div[role="option"]', { hasText: counterpartyName }).first().click()
    await expect(cpTrigger).toContainText(counterpartyName, { timeout: 10_000 })

    // 3) Defaults section: pick the seeded warehouse as the header default
    // (XOR seeding must flow into both lines on submit).
    const defaultsSection = page.getByRole("button", { name: "المستودع والمشروع الافتراضي" })
    await defaultsSection.click()
    await expect(defaultsSection).toHaveAttribute("aria-expanded", "true")
    const warehouseField = page.locator("label").filter({ hasText: "المستودع الافتراضي" })
    const warehouseTrigger = warehouseField.locator("[role=combobox]")
    await warehouseTrigger.click()
    await page.locator('div[role="option"]', { hasText: warehouseName }).first().click()
    await expect(warehouseTrigger).toContainText(warehouseName, { timeout: 10_000 })

    // 4) Re-render by adding a line item: every opened section stays open and
    // the debt state survives.
    await page.getByRole("button", { name: "إضافة مادة" }).click()
    await expect(debtSection).toHaveAttribute("aria-expanded", "true")
    await expect(cpSection).toHaveAttribute("aria-expanded", "true")
    await expect(defaultsSection).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByLabel("هل هذه دين؟")).toBeVisible()

    // 5) Notes section: fill the note and attach a file. The attachment is
    // uploaded after the create RPC, so the details-navigation assertion below
    // also proves the file path through the section works end to end.
    const notesSection = page.getByRole("button", { name: "ملاحظات وملفات" })
    await notesSection.click()
    await expect(notesSection).toHaveAttribute("aria-expanded", "true")
    await page.getByLabel("ملاحظة").fill("ملاحظة إفصاح تدريجي")
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "invoice-note.png",
      mimeType: "image/png",
      // 1x1 transparent PNG — the API only accepts pdf/jpeg/png/webp.
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    })

    // 6) Fill both lines (definition + quantity + unit price above the paid
    // amount so the remaining debt stays positive) and save.
    const definitionSelects = page.getByLabel("تعريف العنصر")
    await definitionSelects.first().selectOption({ index: 1 })
    await definitionSelects.last().selectOption({ index: 1 })
    const quantityInputs = page.getByLabel(/^الكمية/)
    await quantityInputs.first().fill("10")
    await quantityInputs.last().fill("10")
    const priceInputs = page.getByLabel("سعر الوحدة")
    await priceInputs.first().fill("100")
    await priceInputs.last().fill("100")

    await page.getByRole("button", { name: "حفظ الفاتورة" }).click()
    await expect(page.getByRole("link", { name: "تفاصيل الفاتورة" })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(itemName).first()).toBeVisible({ timeout: 15_000 })

    // 7) DB seam: the created group carries supplier, counterparty, warehouse,
    // note and debt — and both lines inherited the header warehouse (XOR
    // seeding intact with the sections in play).
    const Database = loadDatabaseConstructor()
    const db = new Database(findE2eDatabase(), { readonly: true })
    try {
      const cpId = db
        .prepare("SELECT id FROM external_counterparty WHERE full_name = ?")
        .get(counterpartyName) as { id: string } | undefined
      expect(cpId).toBeDefined()

      const warehouseId = db
        .prepare("SELECT id FROM warehouse WHERE name = ?")
        .get(warehouseName) as { id: string } | undefined
      expect(warehouseId).toBeDefined()

      const row = db
        .prepare(
          "SELECT id, supplier_name, external_counterparty_id, warehouse_id, project_id, note, paid_amount_dzd, remaining_debt_dzd FROM inventory_invoice_group ORDER BY rowid DESC LIMIT 1",
        )
        .get() as {
        id: string
        supplier_name: string | null
        external_counterparty_id: string | null
        warehouse_id: string | null
        project_id: string | null
        note: string | null
        paid_amount_dzd: number
        remaining_debt_dzd: number
      }

      expect(row.supplier_name).toBe(counterpartyName)
      expect(row.external_counterparty_id).toBe(cpId!.id)
      expect(row.warehouse_id).toBe(warehouseId!.id)
      expect(row.project_id).toBeNull()
      expect(row.note).toBe("ملاحظة إفصاح تدريجي")
      expect(row.paid_amount_dzd).toBe(500)
      expect(row.remaining_debt_dzd).toBeGreaterThan(0)

      const entryRows = db
        .prepare("SELECT warehouse_id, project_id FROM inventory_entry WHERE invoice_group_id = ? ORDER BY rowid")
        .all(row.id) as Array<{ warehouse_id: string | null; project_id: string | null }>
      expect(entryRows).toHaveLength(2)
      for (const entry of entryRows) {
        expect(entry.warehouse_id).toBe(warehouseId!.id)
        expect(entry.project_id).toBeNull()
      }

      // The image attached through the notes section was uploaded after the
      // create RPC — the navigation above already proves the upload resolved;
      // the DB row pins it.
      const attachmentRow = db
        .prepare("SELECT original_name FROM inventory_invoice_attachment WHERE invoice_group_id = ?")
        .all(row.id) as Array<{ original_name: string }>
      expect(attachmentRow).toHaveLength(1)
      expect(attachmentRow[0].original_name).toBe("invoice-note.png")
    } finally {
      db.close()
    }
  })
})