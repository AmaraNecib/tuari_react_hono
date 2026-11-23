import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { FinancialClient } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { ExactDebtsPage } from "@/features/debts/debts-exact-page"
import { ExactExpensesPage, type ExpensesPageProps } from "@/features/expenses/expenses-page"
import { InventoryItemDefinitionsPage } from "@/features/inventory/inventory-item-definitions-page"
import { ExactInventoryPage, type ExactInventoryLocation, type ExactInventoryParty } from "@/features/inventory/inventory-exact-page"
import { ExactInvoicesPage, type ExactInvoiceParty } from "@/features/invoices/invoices-exact-page"
import { financialClient } from "@/lib/orpc-client"

export type ExactFinancialRoute = "debts" | "expenses" | "inventory" | "invoices"

export function ExactFinancialRoutePage({ route, parties, locations, expenses, invoiceId, createInvoice, initialInventoryMovement = false, payrollEmployees }: {
  route: ExactFinancialRoute
  payrollEmployees?: { id: string; label: string }[]
  parties: ExactInvoiceParty[]
  locations: ExactInventoryLocation[]
  expenses: ExpensesPageProps
  invoiceId?: string
  createInvoice?: boolean
  initialInventoryMovement?: boolean
}) {
  const clients: FinancialClient = financialClient
  switch (route) {
    case "debts":
      return <ExactDebtsPage client={clients.debts} payrollEmployees={payrollEmployees?.map(employee => ({ ...employee, partyType: "INTERNAL_WORKER" as const }))} parties={parties.map(party => ({
        id: party.id,
        label: party.label,
        partyType: party.type === "WORKER" ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY",
      }))} />
    case "expenses":
      return <ExactExpensesPage client={clients.expenses} {...expenses} />
    case "invoices":
      return <ExactInvoicesPage client={clients.invoices} parties={parties} initialInvoiceId={invoiceId} initialCreate={createInvoice} />
    case "inventory":
      return <ExactInventoryRoute client={clients} locations={locations} parties={parties} initialMovement={initialInventoryMovement} />
  }
}

function ExactInventoryRoute({ client, locations, parties, initialMovement }: {
  client: FinancialClient
  locations: ExactInventoryLocation[]
  parties: ExactInventoryParty[]
  initialMovement: boolean
}) {
  const { t, i18n } = useTranslation()
  const [section, setSection] = useState<"stock" | "catalog">("stock")
  return <div dir={i18n.dir()} className="min-w-0 space-y-5">
    <nav aria-label={t("exactCommerce.navigation")} className="flex flex-wrap gap-2">
      <Button variant={section === "stock" ? "default" : "outline"} aria-pressed={section === "stock"} onClick={() => setSection("stock")}>{t("exactCommerce.inventoryTitle")}</Button>
      <Button variant={section === "catalog" ? "default" : "outline"} aria-pressed={section === "catalog"} onClick={() => setSection("catalog")}>{t("inventoryPage.itemDefinitions.title")}</Button>
    </nav>
    {section === "stock"
      ? <ExactInventoryPage client={client.inventory} locations={locations} parties={parties} initialMovement={initialMovement} />
      : <InventoryItemDefinitionsPage />}
  </div>
}
