import { expect, type Page } from "@playwright/test"

/**
 * Fills one invoice line on `/invoices/create` with the variant-C picker.
 *
 * The row's type is the FIRST control and it gates the item picker (owner item
 * 13): the item select is disabled and offers nothing until the type is chosen.
 * The item options are also server-filtered by the chosen kind and keyset-paged,
 * so this searches for the fixture's unique name before selecting it — an option
 * that sorts off the first page is reachable only through the search box.
 */
export async function selectInvoiceLineItem(
  page: Page,
  options: { index?: number; kind: "CONSUMABLE" | "ASSET"; itemName: string },
): Promise<void> {
  const index = options.index ?? 0

  await page.getByLabel("النوع").nth(index).selectOption(options.kind)

  const definitionSelect = page.getByRole("combobox", { name: "تعريف العنصر" }).nth(index)
  await expect(definitionSelect).toBeEnabled()

  // Narrow the paged set to the fixture so the option is present even when the
  // catalog is larger than one page (the hook debounces ~250ms).
  await page.getByLabel("ابحث عن عنصر...").nth(index).fill(options.itemName)

  const option = definitionSelect.locator("option").filter({ hasText: options.itemName })
  await expect(option).toHaveCount(1, { timeout: 10_000 })
  const value = await option.getAttribute("value")
  await definitionSelect.selectOption(value ?? "")
}
