import { useMemo, useState, type ChangeEvent } from "react"

import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/form-controls"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { AppShellFilterShell, usePaginatedRows } from "@/features/app-shell/app-shell-table-primitives"
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls"
import { AdvancedSearchBar } from "@/features/shared/advanced-search-bar"
import { BatchOperationsToolbar } from "@/features/shared/batch-operations-toolbar"
import { useBatchSelection } from "@/hooks/use-batch-selection"

import { useInventoryInvoiceGroupsQuery } from "./inventory-hooks"

interface InventoryInvoicesPageProps {
  onCreate: () => void
  onOpen: (invoiceId: string) => void
}

type InvoiceStatusFilter = "ALL" | "PAID" | "UNPAID"

export function InventoryInvoicesPage({ onCreate, onOpen }: InventoryInvoicesPageProps) {
  const invoicesQuery = useInventoryInvoiceGroupsQuery()
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const batchSelection = useBatchSelection(invoicesQuery.data?.items ?? [])

  const normalizedQuery = query.trim().toLowerCase()
  const status = (filters.status as InvoiceStatusFilter) ?? "ALL"

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
          title="الفواتير"
          description="كل فاتورة تجمع العناصر التي تمت إضافتها دفعة واحدة مع الملفات المرفقة بها."
          action={<PageActionGroup><Button onClick={onCreate}>فاتورة جديدة</Button></PageActionGroup>}
        />

        <AppShellFilterShell>
          <div className="col-span-full lg:col-span-3">
            <AdvancedSearchBar
              searchFields={[
                { key: "query", label: "البحث", placeholder: "رقم الفاتورة أو اسم المورد" },
              ]}
              onSearch={(searchQuery, filtersObj) => {
                setQuery(searchQuery)
                setFilters(filtersObj)
              }}
              storageKey="invoices-search-filters"
            />
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">الحالة</span>
            <NativeSelect value={status} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilters(prev => ({ ...prev, status: e.target.value }))}>
              <option value="ALL">الكل</option>
              <option value="PAID">مدفوعة</option>
              <option value="UNPAID">متبقي دين</option>
            </NativeSelect>
          </label>
        </AppShellFilterShell>

        <div className="grid gap-3">
          {pagedInvoices.map((invoice) => {
            const isSelected = batchSelection.selectedIds.has(invoice.id);
            return (
              <div
                key={invoice.id}
                className={`flex items-start gap-3 rounded-2xl border border-border/70 px-4 py-4 transition ${
                  isSelected ? "bg-muted/30" : "bg-background/10"
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
                      <div className="font-medium text-foreground">{invoice.invoiceNumber || "فاتورة بدون رقم"}</div>
                      <div className="text-sm text-muted-foreground">{invoice.supplierName || "بدون مورد محدد"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("ar-DZ") : "بدون تاريخ"}</div>
                  </div>
                </button>
              </div>
            );
          })}
          {filteredInvoices.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد فواتير بعد.</p> : null}
        </div>

        <BatchOperationsToolbar
          selectCount={batchSelection.selectCount}
          isAllSelected={batchSelection.isAllSelected}
          isPartiallySelected={batchSelection.isPartiallySelected}
          operations={[
            { id: "export", label: "تصدير", variant: "outline" },
            { id: "delete", label: "حذف", variant: "destructive", requiresConfirmation: true },
          ]}
          onToggleAll={batchSelection.toggleAll}
          onClearSelection={batchSelection.clearSelection}
          onOperation={(operationId) => {
            console.log(`Operation ${operationId} on items:`, batchSelection.selectedItems.map((i: any) => i.id));
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
