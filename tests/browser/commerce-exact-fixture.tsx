import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ExactInvoicesClient, ExactInventoryClient } from "@tuari/contracts"
import "../../apps/web/src/i18n"
import "../../apps/web/src/styles.css"
import { ExactCommerceWorkspace } from "../../apps/web/src/features/shared/exact-commerce-workspace"
import { sessionQueryKey } from "../../apps/web/src/features/app-shell/workspace-keys"

// Synthetic authenticated identity is confined to this disposable browser fixture.
const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
query.setQueryData(sessionQueryKey, { user: { id: "fixture-owner", name: "Fixture owner", phone: "0612345678", version: "0.0.0" } })
const client = (domain: string, actions: string[]) => Object.fromEntries(actions.map(action => [action, async (input?: unknown) => {
  const response = await fetch("/__exact-commerce-fixture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, action, input }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message)
  return result
}]))
const invoices = client("invoices", ["getInvoice", "listInvoices", "createInvoice", "updateInvoice", "receiveInvoice", "voidInvoice", "deleteDraft", "getPayment", "listPayments", "createPayment", "allocatePayment", "voidPayment", "deleteUnallocatedPayment", "splitPayment"]) as ExactInvoicesClient
const inventory = client("inventory", ["definitions", "getInvoice", "listInvoices", "createInvoice", "recordPayment", "recordOutboundPayment", "locationContents", "transferAsset", "transferConsumable", "createOutbound", "listOutbounds", "getOutbound", "chargeDefault", "projectCharges", "projectContribution", "updateCharge", "voidCharge"]) as ExactInventoryClient
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={query}><ExactCommerceWorkspace clients={{ invoices, inventory }}
  invoiceParties={[{ id: "party", label: "المورد التجريبي", type: "EXTERNAL_COUNTERPARTY" }]}
  inventoryParties={[{ id: "party", label: "المورد التجريبي" }]}
  locations={[{ id: "warehouse", label: "المخزن التجريبي", type: "WAREHOUSE" }, { id: "project", label: "المشروع التجريبي", type: "PROJECT" }]} /></QueryClientProvider>)
