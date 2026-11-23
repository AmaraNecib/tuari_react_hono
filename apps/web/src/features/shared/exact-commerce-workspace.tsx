import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { ExactInvoicesClient, ExactInventoryClient } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { ExactInvoicesPage, type ExactInvoiceParty } from "@/features/invoices/invoices-exact-page"
import { ExactInventoryPage, type ExactInventoryLocation, type ExactInventoryParty } from "@/features/inventory/inventory-exact-page"

/** Explicit opt-in application root. Numeric routes and their caches remain untouched. */
export function ExactCommerceWorkspace({ clients, locations, invoiceParties, inventoryParties }: {
  clients: { invoices: ExactInvoicesClient; inventory: ExactInventoryClient }
  locations: ExactInventoryLocation[]
  invoiceParties: ExactInvoiceParty[]
  inventoryParties: ExactInventoryParty[]
}) {
  const { t, i18n } = useTranslation()
  const [section, setSection] = useState<"invoices" | "inventory">("invoices")
  return <div dir={i18n.dir()} className="min-w-0 space-y-6">
    <nav aria-label={t("exactCommerce.navigation")} className="flex flex-wrap gap-2">
      <Button variant={section === "invoices" ? "default" : "outline"} aria-pressed={section === "invoices"} onClick={() => setSection("invoices")}>{t("exactCommerce.invoiceTitle")}</Button>
      <Button variant={section === "inventory" ? "default" : "outline"} aria-pressed={section === "inventory"} onClick={() => setSection("inventory")}>{t("exactCommerce.inventoryTitle")}</Button>
    </nav>
    {section === "invoices" ? <ExactInvoicesPage client={clients.invoices} parties={invoiceParties} /> : <ExactInventoryPage client={clients.inventory} locations={locations} parties={inventoryParties} />}
  </div>
}
