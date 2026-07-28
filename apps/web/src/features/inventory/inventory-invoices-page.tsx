import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { AppShellFilterShell, usePaginatedRows } from "@/features/app-shell/app-shell-table-primitives"
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls"
import { AdvancedSearchBar, type QuickFilter } from "@/features/shared/advanced-search-bar"
import { BatchOperationsToolbar } from "@/features/shared/batch-operations-toolbar"
import { useBatchSelection } from "@/hooks/use-batch-selection"

import { useInventoryInvoiceGroupsQuery } from "./inventory-hooks"

interface InventoryInvoicesPageProps {
  onCreate: () => void
  onOpen: (invoiceId: string) => void
}

type InvoiceStatusFilter = "ALL" | "PAID" | "UNPAID"

/** Invoice listing page with filters and batch operations. */
/**
 * @description Component
 */
export function InventoryInvoicesPage({ onCreate, onOpen }: InventoryInvoicesPageProps) {
  const { t } = useTranslation()
  const invoicesQuery = useInventoryInvoiceGroupsQuery()
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Record<string, unknown>>({ status: "ALL" })
  const batchSelection = useBatchSelection(invoicesQuery.data?.items ?? [])

  const normalizedQuery = query.trim().toLowerCase()
  const status = (filters.status as InvoiceStatusFilter) ?? "ALL"
  const hasActiveFilters = normalizedQuery.length > 0 || status !== "ALL"

  const quickFilters: QuickFilter[] = useMemo(
    () => [
      {
        id: "all",
        label: t("inventoryPage.invoices.statusAll", "الكل"),
        filters: { status: "ALL" },
      },
      {
        id: "paid",
        label: t("inventoryPage.invoices.statusPaid", "مدفوعة"),
        filters: { status: "PAID" },
      },
      {
        id: "unpaid",
        label: t("inventoryPage.invoices.statusUnpaid", "متبقي دين"),
        filters: { status: "UNPAID" },
      },
    ],
    [t]
  )

  const filteredInvoices = useMemo(() => {
    let result = invoicesQuery.data?.items ?? []

    if (normalizedQuery) {
      result = result.filter((invoice) =>
        [invoice.invoiceNumber, invoice.supplierName]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      )
    }

    if (status !== "ALL") {
      result = result.filter((invoice) => {
        const isPaid = invoice.remainingDebtDzd === 0
        return status === "PAID" ? isPaid : !isPaid
      })
    }

    return result
  }, [invoicesQuery.data?.items, normalizedQuery, status])

  const { page, pageSize, pagedRows: pagedInvoices, setPage, setPageSize } = usePaginatedRows({
    rows: filteredInvoices,
    resetPageDeps: [normalizedQuery, status],
  })

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title={t("inventoryPage.invoices.title")}
          description={t("inventoryPage.invoices.description")}
          action={<PageActionGroup><Button onClick={onCreate}>{t("inventoryPage.invoices.createButton")}</Button></PageActionGroup>}
        />

        <AppShellFilterShell>
          <div className="flex-1 min-w-[16rem]">
            <AdvancedSearchBar
              onSearch={(searchQuery, filtersObj) => {
                setQuery(searchQuery)
                setFilters(filtersObj)
              }}
              storageKey="invoices-search-filters"
              initialFilters={{ status: "ALL" }}
              quickFilters={quickFilters}
            />
          </div>
        </AppShellFilterShell>

        <div className="grid gap-3">
          {pagedInvoices.map((invoice) => {
            const isSelected = batchSelection.selectedIds.has(invoice.id);
            return (
              <div
                key={invoice.id}
                className={`flex items-start gap-3 rounded-xl px-4 py-4 transition ${
                  isSelected ? "bg-muted/30" : "hover:bg-surface-2"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => batchSelection.toggleItem(invoice.id)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  className="flex-1 text-start transition hover:opacity-80"
                  type="button"
                  onClick={() => onOpen(invoice.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{invoice.invoiceNumber || t("inventoryPage.invoices.untitled")}</div>
                      <div className="text-sm text-muted-foreground">{invoice.supplierName || t("inventoryPage.invoices.noSupplier")}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("ar-DZ") : t("inventoryPage.invoices.noDate")}</div>
                  </div>
                </button>
              </div>
            );
          })}
          {filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters ? t("search.noResults") : t("inventoryPage.invoices.empty")}
              </p>
              {!hasActiveFilters ? (
                <Button size="sm" onClick={onCreate}>{t("inventoryPage.invoices.createButton")}</Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <BatchOperationsToolbar
          selectCount={batchSelection.selectCount}
          isAllSelected={batchSelection.isAllSelected}
          isPartiallySelected={batchSelection.isPartiallySelected}
          operations={[
            { id: "export", label: t("inventoryPage.invoices.export"), variant: "outline" },
            { id: "delete", label: t("inventoryPage.invoices.delete"), variant: "destructive", requiresConfirmation: true },
          ]}
          onToggleAll={batchSelection.toggleAll}
          onClearSelection={batchSelection.clearSelection}
          onOperation={(operationId) => {
            console.log(`Operation ${operationId} on items:`, batchSelection.selectedItems.map((i) => i.id));
            batchSelection.clearSelection();
          }}
        />

        {filteredInvoices.length > pageSize && (
          <TablePaginationControls
            page={page}
            pageSize={pageSize}
            totalCount={filteredInvoices.length}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize: number) => {
              setPage(1)
              setPageSize(nextPageSize)
            }}
          />
        )}
      </PageSurfaceContent>
    </Surface>
  )
}
