import { expect, test } from "@playwright/test"
import { bootstrapOrSignIn } from "./helpers/session"

test.skip(process.env.CONNECTED_EXACT_TEST !== "1", "Requires the selected-exact native database")

test("owner opens the persisted invoice attachment through its actual browser link", async ({ page, context }) => {
  await bootstrapOrSignIn(page)
  const groupId = await page.evaluate(async api => {
    async function rpc(path: string, input: unknown) {
      const response = await fetch(`${api}/rpc/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) })
      if (!response.ok) throw new Error(`${path}: ${response.status}`)
      return (await response.json()).json
    }
    const item = await rpc("inventoryItemDefinitionsCreate", { name: "Attachment proof material", itemType: "CONSUMABLE", unit: "bag" })
    const warehouse = await rpc("warehousesCreate", { name: "Attachment proof depot", status: "ACTIVE" })
    if (!item.success || !warehouse.success) throw new Error("Fixture creation failed")
    const purchase = await rpc("financial/inventory/createInvoice", { requestId: crypto.randomUUID(), warehouseId: warehouse.item.id, entries: [{ kind: "CONSUMABLE", itemDefinitionId: item.item.id, quantity: 1, unitPriceDzd: "1.0000" }] })
    return purchase.group.id as string
  }, process.env.PLAYWRIGHT_API_URL!)
  await page.goto(`/invoices/${groupId}`)
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")
  const files = page.locator("section").filter({ has: page.getByRole("heading", { name: "ملفات الفاتورة", exact: true }) })
  await files.getByLabel("ملفات الفاتورة", { exact: true }).setInputFiles({ name: "navigation-proof.png", mimeType: "image/png", buffer: bytes })
  await files.getByRole("button", { name: "حفظ", exact: true }).click()
  const link = page.getByRole("link", { name: "navigation-proof.png", exact: true })
  await expect(link).toBeVisible()
  await page.reload()
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute("rel", "noreferrer")
  const responsePromise = context.waitForEvent("response", { predicate: response => response.url().includes("/api/inventory/attachments/") && response.request().isNavigationRequest() })
  const popupPromise = page.waitForEvent("popup")
  await link.click()
  const popup = await popupPromise
  const response = await responsePromise
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toBe("image/png")
  const headers = await response.request().allHeaders()
  expect(headers.origin).toBeUndefined()
  expect(headers.referer).toBeUndefined()
  expect(await response.body()).toEqual(bytes)
  await expect(popup.locator("img")).toBeVisible()
  await popup.close()
})
