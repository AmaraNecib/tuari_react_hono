import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ExactDebtsClient } from "@tuari/contracts"
import "../../apps/web/src/i18n"
import "../../apps/web/src/styles.css"
import { ExactDebtsPage } from "../../apps/web/src/features/debts/debts-exact-page"
import { sessionQueryKey } from "../../apps/web/src/features/app-shell/workspace-keys"
import { setMoneyGrouping } from "../../apps/web/src/features/preferences/money-format-preference"

const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
query.setQueryData(sessionQueryKey, { user: { id: "fixture-owner", name: "Fixture owner", phone: "0612345678", version: "0.0.0" } })
const call = async (action: string, input?: unknown) => {
  const response = await fetch("/__exact-debt-fixture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message)
  return result
}
const client = Object.fromEntries(["summary", "detail", "create", "post", "pay", "correct", "void", "settle"].map(action => [action, (input?: unknown) => call(action, input)])) as ExactDebtsClient
Object.assign(window, { fixtureMoneyGrouping: setMoneyGrouping })
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={query}><ExactDebtsPage client={client} parties={[
  { id: "00000000-0000-4000-8000-000000000999", label: "المورد أحمد", partyType: "EXTERNAL_COUNTERPARTY" },
  { id: "00000000-0000-4000-8000-000000000998", label: "العامل يوسف", partyType: "INTERNAL_WORKER" },
]} /></QueryClientProvider>)
