import { Button } from "@/components/ui/button"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { useOutboundTransfersQuery } from "./inventory-hooks"

export function OutboundTransfersPage({ onCreate }: { onCreate: () => void }) {
  const transfersQuery = useOutboundTransfersQuery()

  const transfers = transfersQuery.data?.items ?? []
  const isLoading = transfersQuery.isLoading

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title="التحويلات الخارجية" description="إدارة المبيعات والتحويلات للأطراف الخارجية" action={<PageActionGroup><Button onClick={onCreate}>إنشاء تحويل</Button></PageActionGroup>} />
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="قائمة التحويلات" description="جميع التحويلات الخارجية المسجلة في النظام" />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">جاري تحميل التحويلات...</p>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد تحويلات خارجية بعد.</p>
          ) : (
            <div className="grid gap-3">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="rounded-2xl border border-border/70 p-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-foreground">
                        {transfer.counterpartyId}
                      </div>
                      <div className="text-muted-foreground">
                        من {transfer.fromType === "WAREHOUSE" ? "مستودع" : "مشروع"}: {transfer.fromId}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-foreground">
                        {transfer.transferType === "SALE" ? "بيع" : transfer.transferType === "GIFT" ? "هدية" : "إرجاع"}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(transfer.transferDate).toLocaleDateString("ar-DZ")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}
