import { useMemo, useState, type ChangeEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { AppShellFilterShell, usePaginatedRows } from "@/features/app-shell/app-shell-table-primitives"
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls"

import { useInventoryInvoiceGroupsQuery } from "./inventory-hooks"

interface InventoryInvoicesPageProps {
  onCreate: () => void
  onOpen: (invoiceId: string) => void
}

type InvoiceStatusFilter = "ALL" | "PAID" | "UNPAID"

export function InventoryInvoicesPage({ onCreate, onOpen }: InventoryInvoicesPageProps) {
  const invoicesQuery = useInventoryInvoiceGroupsQuery()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<InvoiceStatusFilter>("ALL")

  const normalizedQuery = query.trim().toLowerCase()
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
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">البحث</span>
            <Input
              placeholder="رقم الفاتورة أو اسم المورد"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">الحالة</span>
            <NativeSelect value={status} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as InvoiceStatusFilter)}>
              <option value="ALL">الكل</option>
              <option value="PAID">مدفوعة</option>
              <option value="UNPAID">متبقي دين</option>
            </NativeSelect>
          </label>
        </AppShellFilterShell>

        <div className="grid gap-3">
          {pagedInvoices.map((invoice) => (
            <button key={invoice.id} className="rounded-2xl border border-border/70 px-4 py-4 text-start transition hover:bg-muted/30" type="button" onClick={() => onOpen(invoice.id)}>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-medium text-foreground">{invoice.invoiceNumber || "فاتورة بدون رقم"}</div>
                  <div className="text-sm text-muted-foreground">{invoice.supplierName || "بدون مورد محدد"}</div>
                </div>
                <div className="text-xs text-muted-foreground">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("ar-DZ") : "بدون تاريخ"}</div>
              </div>
            </button>
          ))}
          {filteredInvoices.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد فواتير بعد.</p> : null}
        </div>

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
