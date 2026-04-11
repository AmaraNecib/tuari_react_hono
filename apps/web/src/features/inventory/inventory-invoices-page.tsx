import { Button } from "@/components/ui/button"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"

import { useInventoryInvoiceGroupsQuery } from "./inventory-hooks"

export function InventoryInvoicesPage({ onCreate, onOpen }: { onCreate: () => void; onOpen: (invoiceId: string) => void }) {
  const invoicesQuery = useInventoryInvoiceGroupsQuery()

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title="الفواتير"
          description="كل فاتورة تجمع العناصر التي تمت إضافتها دفعة واحدة مع الملفات المرفقة بها."
          action={<PageActionGroup><Button onClick={onCreate}>فاتورة جديدة</Button></PageActionGroup>}
        />
        <div className="grid gap-3">
          {invoicesQuery.data?.items.map((invoice) => (
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
          {invoicesQuery.data?.items.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد فواتير بعد.</p> : null}
        </div>
      </PageSurfaceContent>
    </Surface>
  )
}
