// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactInventoryClient, ExactInvoicesClient } from "@tuari/contracts"
import { ar } from "@/i18n/resources/ar"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { ExactInvoicesPage } from "@/features/invoices/invoices-exact-page"
import { ExactInventoryPage } from "@/features/inventory/inventory-exact-page"
import { ExactPriceInput } from "./exact-price-input"
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
const exactCommerceAr = ar.translation.exactCommerce
const queries: QueryClient[] = []
afterEach(() => { cleanup(); queries.splice(0).forEach(query => query.clear()) })
async function fixture(children: React.ReactNode) {
  // Synthetic English proves reactive lookup without enabling another production locale.
  const locale = createInstance()
  await locale.init({ lng: "ar", fallbackLng: "ar", supportedLngs: ["ar", "en"], resources: { ar, en: { translation: {
    common: { currency: "DZD", back: "Back", retry: "Retry", saving: "Saving", notes: "Notes", note: "Note", invoiceDate: "Invoice date" },
    exactCommerce: { ...Object.fromEntries(Object.keys(exactCommerceAr).map(key => [key, `test:${key}`])), lineNumber: "Line {{number}}", internalMovementDescription: "Source: {{source}}. Internal transfer." },
  } } }, interpolation: { escapeValue: false } })
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queries.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  render(<I18nextProvider i18n={locale}><QueryClientProvider client={query}>{children}</QueryClientProvider></I18nextProvider>)
  return { changeLanguage: () => act(async () => { await locale.changeLanguage("en") }) }
}
describe("exact commerce translations", () => {
  it("reactively translates the invoice page and editor, including direction and interpolated labels", async () => {
    const client = { listInvoices: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }), listPayments: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }) }
    const { changeLanguage } = await fixture(<ExactInvoicesPage client={client as unknown as ExactInvoicesClient} parties={[{ id: "party", type: "EXTERNAL_COUNTERPARTY", label: "Synthetic party" }]} />)
    await screen.findByRole("heading", { name: exactCommerceAr.invoiceTitle })
    await changeLanguage()
    expect(screen.getByRole("heading", { name: "test:invoiceTitle" })).toBeTruthy()
    expect(screen.getByRole("main").getAttribute("dir")).toBe("ltr")
    fireEvent.click(screen.getByRole("button", { name: "test:newInvoice" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("textbox", { name: "test:unitPrice" })).toBeTruthy()
    expect(within(dialog).getByText("Line 1")).toBeTruthy()
    expect(dialog.getAttribute("dir")).toBe("ltr")
  })
  it("translates inventory, purchase and movement components rather than embedding Arabic copy", async () => {
    const client = { listInvoices: vi.fn().mockResolvedValue([]), definitions: vi.fn().mockResolvedValue([{ id: "material", name: "Synthetic material", itemType: "CONSUMABLE", isActive: true, unit: "m" }]), listOutbounds: vi.fn().mockResolvedValue([]), locationContents: vi.fn().mockResolvedValue({ assets: [], consumables: [] }) }
    const { changeLanguage } = await fixture(<ExactInventoryPage client={client as unknown as ExactInventoryClient} locations={[{ id: "warehouse", type: "WAREHOUSE", label: "Synthetic warehouse" }]} parties={[]} />)
    await screen.findByText(exactCommerceAr.noPurchases)
    await changeLanguage()
    expect(screen.getByRole("heading", { name: "test:inventoryTitle" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "test:newInventoryInvoice" }))
    let dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("textbox", { name: "test:unitPrice" })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "test:savePurchaseAndStock" })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }))
    fireEvent.click(screen.getByRole("button", { name: "test:movementTitle" }))
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("combobox", { name: "test:movementType" })).toBeTruthy()
    expect(within(dialog).getByText("Source: Synthetic warehouse. Internal transfer.")).toBeTruthy()
  })
  it("translates the price4 validation error after a language change", async () => {
    const { changeLanguage } = await fixture(<ExactPriceInput label="Synthetic unit price" value="1.23456" onChange={() => {}} />)
    fireEvent.blur(screen.getByRole("textbox", { name: "Synthetic unit price" }))
    expect(screen.getByRole("alert").textContent).toBe(exactCommerceAr.invalidPrice)
    await changeLanguage()
    expect(screen.getByRole("alert").textContent).toBe("test:invalidPrice")
  })
  it.each([
    "invoices/invoices-exact-page.tsx", "inventory/inventory-exact-page.tsx", "inventory/inventory-exact-purchase-form.tsx", "inventory/inventory-exact-movement-form.tsx", "shared/exact-price-input.tsx",
  ])("keeps localized copy out of %s", path => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", path), "utf8")
    expect(source).not.toMatch(/[\u0600-\u06ff]/u)
  })
})
