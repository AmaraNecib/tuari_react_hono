import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "@/i18n"
import "@/styles.css"
import { DashboardSection } from "@/features/app-shell/dashboard-section"
import { ReportBuilder } from "@/features/reports/report-builder"
import { ProjectCostSection } from "@/features/projects/project-cost-section"
import { DebtLedgerPanel } from "@/features/debts/debt-ledger-panel"
import { DebtPartySummaryCard } from "@/features/debts/debt-party-summary-card"
import { ExternalCounterpartiesPage } from "@/features/externals/externals-page"
import { RecordHistoryTable } from "@/features/shared/record-page-frame"
import { InventoryInvoiceDetailsPage } from "@/features/inventory/inventory-invoice-details-page"
import { TransferHistoryPage } from "@/features/inventory/transfer-history-page"
import { SystemLogSection } from "@/features/app-shell/system-log-section"

const noop = () => {}
const timestamp = "2026-10-15T10:00:00.000Z"
const account = {
  id: "synthetic-account", partyType: "EXTERNAL_COUNTERPARTY", workerId: null,
  externalCounterpartyId: "synthetic-party", direction: "PAYABLE", currentBalance: -1234.5,
  status: "OPEN", note: null, createdAt: timestamp, updatedAt: timestamp,
}
const entry = {
  id: "synthetic-entry", debtAccountId: account.id, entryType: "OPENING", signedAmountDzd: -12500.25,
  balanceAfterDzd: -1234.5, status: "LIVE", entryDate: timestamp, note: "بيانات تجريبية",
  createdAt: timestamp, updatedAt: timestamp,
}
const invoice = {
  group: { id: "synthetic-invoice", invoiceNumber: "SYNTHETIC-535", supplierName: "مورد تجريبي", invoiceDate: timestamp,
    grossTotalDzd: 1234.5, paidAmountDzd: 0, remainingDebtDzd: 1234.5 },
  entries: [{ id: "synthetic-item", itemName: "مواد تجريبية", itemType: "CONSUMABLE", quantity: 10, unit: "وحدة", totalPriceDzd: 1234.5, assets: [] }],
  consumableBalances: [], movements: [], attachments: [],
}
const project = {
  projectId: "synthetic-project", totalDzd: 8500.25,
  parts: { expensesDzd: 10000.5, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: -1500.25 },
  expenses: [{ id: "synthetic-expense", expenseDate: timestamp, whatFor: "وقود تجريبي", amountDzd: 10000.5 }],
  salaries: [], stock: [],
  materialMovements: [{ id: "synthetic-movement", itemDefinitionId: "synthetic-def", itemName: "إسمنت تجريبي", unit: "كيس", quantity: 3,
    unitPriceDzd: 583.5833, valueDzd: 1750.75, direction: "OUT", occurredAt: timestamp },
    { id: "synthetic-in", itemDefinitionId: "synthetic-def", itemName: "مواد واردة تجريبية", unit: "كيس", quantity: 2,
      unitPriceDzd: 125.25, valueDzd: 250.5, direction: "IN", occurredAt: timestamp }],
  parkedInventory: { totalDzd: 12000, assets: [{ assetUnitId: "synthetic-asset", assetName: "رافعة تجريبية", purchasePriceDzd: 12000 }] },
}
const transfer = {
  id: "synthetic-transfer", type: "SALE", date: timestamp,
  from: { id: "synthetic-warehouse", type: "WAREHOUSE", name: "مستودع تجريبي" }, to: null,
  counterparty: { name: "طرف تجريبي" }, items: [], totalAmount: 1234.567, paidAmount: 10.125,
  remainingDebt: 1224.442, paymentStatus: "PARTIAL", note: "بيانات تجريبية",
}
const log = {
  id: "synthetic-log", transactionId: "synthetic-tx", actorUserId: "synthetic-user", actorLabel: "مستخدم تجريبي", actorCurrentLabel: null,
  actionType: "DEBT_ENTRY_RECORDED", entityType: "DEBT_ENTRY", entityId: entry.id, entityLabel: "طرف تجريبي",
  summary: "تسجيل حركة تجريبية", detail: "نوع الحركة رصيد افتتاحي • القيمة -12500.25 دج • الرصيد بعد العملية 0 دج", createdAt: timestamp,
}
const query = (data: unknown) => ({ data, isPending: false, isLoading: false, isError: false, isFetching: false, error: null, refetch: noop })
Object.assign(window, { __currencyData: {
  useProjectCostQuery: query(project),
  useInventoryInvoiceGroupQuery: query(invoice),
  useDebtsSummaryQuery: query({ debtAccounts: [{ ...account, currentBalance: 1500 }], parties: [] }),
  useTransferHistoryQuery: query({ items: [transfer] }),
  useReportQuery: query({ type: "INVENTORY", generatedAt: timestamp, summary: { totalAssetsDzd: 1234.567, totalConsumablesDzd: 0, totalValueDzd: -50.125 }, byLocation: [], byItemType: [], agingAnalysis: [] }),
} })

const surfaces: Record<string, React.ReactNode> = {
  dashboard: <DashboardSection metrics={{ workers: 1, projects: 2, warehouses: 3, roles: 4, counterparties: 5 }} labels={{ title: "لوحة التحكم", description: "بيانات تجريبية", workers: "عمال", projects: "مشاريع", warehouses: "مستودعات", roles: "أدوار", invoices: "فواتير", outstandingDebts: "ديون متبقية", items: "عناصر", counterparties: "أطراف" }} />,
  reports: <ReportBuilder />,
  project: <ProjectCostSection projectId="synthetic-project" />,
  ledger: <DebtLedgerPanel debtAccount={account as never} debtEntries={[entry] as never} title="حركات تجريبية" />,
  party: <DebtPartySummaryCard accounts={[account] as never} personName="طرف تجريبي" />,
  external: <ExternalCounterpartiesPage counterparties={[{ id: "synthetic-party", fullName: "طرف تجريبي", note: null, openCaseCount: 1, phone: "0000000000", totalBalanceDzd: -1234.5, totalCaseCount: 1 }]} onCreate={noop} onOpen={noop} />,
  history: <RecordHistoryTable emptyLabel="لا يوجد سجل" rows={[
    { id: "s1", typeLabel: "حالة عمل", title: "عامل تجريبي", detail: "الراتب الحالي 1234.5678 دج / يوم", periodLabel: "2026-10-15", statusLabel: "نشط" },
    { id: "s2", typeLabel: "حالة عمل", title: "عامل تجريبي", detail: "الراتب الحالي 0 دج / يوم", periodLabel: "2026-10-15", statusLabel: "نشط" },
  ]} />,
  invoice: <InventoryInvoiceDetailsPage invoiceId="synthetic-invoice" onBack={noop} />,
  transfers: <TransferHistoryPage />,
  audit: <SystemLogSection entries={[log] as never} query={query({ items: [log] }) as never} filters={{}} title="السجل التجريبي" onFiltersChange={noop} />,
}
const params = new URLSearchParams(location.search)
const surface = params.get("surface") ?? "project"
document.documentElement.dir = params.get("dir") ?? "rtl"
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <main data-currency-surface={surface} className="p-4">{surfaces[surface]}</main>
  </QueryClientProvider>,
)
