import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { downloadDesktopApiFile } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { resolveApiUrl } from "@/lib/runtime-config"

import {
  useInventoryInvoiceGroupQuery,
  useInventoryProjectsQuery,
  useInventoryWarehousesQuery,
  useTransferInventoryAssetMutation,
  useTransferInventoryConsumableMutation,
} from "./inventory-hooks"
import { RecordInvoicePaymentDialog } from "./record-invoice-payment-dialog"

function buildLocationHref(location: { warehouseId?: string | null; projectId?: string | null }) {
  if (location.warehouseId) {
    return `/warehouses/${encodeURIComponent(location.warehouseId)}?tab=items`
  }

  if (location.projectId) {
    return `/projects/${encodeURIComponent(location.projectId)}?tab=items`
  }

  return null
}

/** Invoice detail page with item list and payment recording. */
/**
 * @description Component
 */
export function InventoryInvoiceDetailsPage({ invoiceId, onBack }: { invoiceId: string; onBack: () => void }) {
  const invoiceQuery = useInventoryInvoiceGroupQuery(invoiceId)
  const [transferSectionExpanded] = useState(false)
  // Only fetch warehouses/projects when transfer section is expanded (lazy loading optimization)
  const warehousesQuery = useInventoryWarehousesQuery(transferSectionExpanded)
  const projectsQuery = useInventoryProjectsQuery(transferSectionExpanded)
  const transferAssetMutation = useTransferInventoryAssetMutation()
  const transferConsumableMutation = useTransferInventoryConsumableMutation()
  const [assetTargets, setAssetTargets] = useState<Record<string, { warehouseId: string; projectId: string }>>({})
  const [consumableTargets, setConsumableTargets] = useState<Record<string, { quantity: string; warehouseId: string; projectId: string }>>({})
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)

  const detail = invoiceQuery.data
  const isDesktop = isDesktopRuntime()
  const warehouses = useMemo(() => warehousesQuery.data?.items ?? [], [warehousesQuery.data?.items])
  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data?.items])

  async function handleAttachmentOpen(attachment: { id: string; originalName: string }) {
    await downloadDesktopApiFile(resolveApiUrl(`/api/inventory/attachments/${attachment.id}`), attachment.originalName)
  }

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title={detail?.group.invoiceNumber || "تفاصيل الفاتورة"} description={detail?.group.supplierName || "بدون مورد محدد"} action={<PageActionGroup><Button variant="outline" onClick={onBack}>العودة إلى الفواتير</Button>{detail && detail.group.remainingDebtDzd > 0 && <Button onClick={() => setPaymentDialogOpen(true)}>تسجيل دفعة</Button>}</PageActionGroup>} />
          {detail ? (
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 p-4">تاريخ الفاتورة: {detail.group.invoiceDate ? new Date(detail.group.invoiceDate).toLocaleDateString("ar-DZ") : "غير محدد"}</div>
              <div className="rounded-xl border border-border/70 p-4">الإجمالي: {detail.group.grossTotalDzd.toFixed(2)} دج</div>
              <div className="rounded-xl border border-border/70 p-4">المدفوع: {detail.group.paidAmountDzd.toFixed(2)} دج</div>
              <div className="rounded-xl border border-border/70 p-4">الدين المتبقي: {detail.group.remainingDebtDzd.toFixed(2)} دج</div>
            </div>
          ) : <p className="text-sm text-muted-foreground">جارٍ تحميل بيانات الفاتورة...</p>}
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="العناصر" description="يمكنك متابعة مكان كل أصل وتحويله، وكذلك تحويل كميات المواد بين المواقع." />
          <div className="grid gap-4">
            {detail?.entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border/70 p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-medium text-foreground">{entry.itemName}</div>
                  <div className="text-muted-foreground">{entry.itemType === "CONSUMABLE" ? `كمية: ${entry.quantity} ${entry.unit ?? ""}` : `عدد الأصول: ${entry.assets.length}`}</div>
                </div>
                <div className="mt-2 text-muted-foreground">الإجمالي: {entry.totalPriceDzd.toFixed(2)} دج</div>

                {entry.assets.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {entry.assets.map((asset) => {
                      const href = buildLocationHref({ warehouseId: asset.currentWarehouseId, projectId: asset.currentProjectId })
                      const target = assetTargets[asset.id] ?? { warehouseId: "", projectId: "" }

                      return (
                        <div key={asset.id} className="rounded-xl bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{asset.assetName}</div>
                              <div className="text-xs text-muted-foreground">المكان الحالي: {asset.currentLocationLabel ?? "غير محدد"}</div>
                            </div>
                            {href ? <a className="text-xs text-primary underline-offset-4 hover:underline" href={href}>فتح الموقع الحالي</a> : null}
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <select className="h-10 rounded-xl border border-border bg-background px-3" value={target.warehouseId} onChange={(event) => setAssetTargets((current) => ({ ...current, [asset.id]: { warehouseId: event.target.value, projectId: event.target.value ? "" : target.projectId } }))}>
                              <option value="">انقل إلى مستودع</option>
                              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                            </select>
                            <select className="h-10 rounded-xl border border-border bg-background px-3" value={target.projectId} onChange={(event) => setAssetTargets((current) => ({ ...current, [asset.id]: { projectId: event.target.value, warehouseId: event.target.value ? "" : target.warehouseId } }))}>
                              <option value="">انقل إلى مشروع</option>
                              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select>
                            <Button disabled={transferAssetMutation.isPending || (!target.warehouseId && !target.projectId)} onClick={() => void transferAssetMutation.mutateAsync({ assetUnitId: asset.id, toWarehouseId: target.warehouseId || null, toProjectId: target.projectId || null })}>تحويل الأصل</Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="الأرصدة الحالية للمواد" description="هذه الكميات تمثل ما بقي الآن في كل موقع بعد الشراء والتحويلات." />
          <div className="grid gap-3">
            {detail?.consumableBalances.map((balance) => {
              const target = consumableTargets[balance.id] ?? { quantity: String(balance.quantity), warehouseId: "", projectId: "" }
              const href = buildLocationHref({ warehouseId: balance.warehouseId, projectId: balance.projectId })
              return (
                <div key={balance.id} className="rounded-xl border border-border/70 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">{balance.itemName}</div>
                      <div className="text-muted-foreground">{balance.locationLabel}</div>
                      <div className="text-muted-foreground">الكمية المتاحة: {balance.quantity}</div>
                    </div>
                    {href ? <a className="text-xs text-primary underline-offset-4 hover:underline" href={href}>فتح الموقع الحالي</a> : null}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <Input type="number" min="0" step="0.01" value={target.quantity} onChange={(event) => setConsumableTargets((current) => ({ ...current, [balance.id]: { ...target, quantity: event.target.value } }))} />
                    <select className="h-10 rounded-xl border border-border bg-background px-3" value={target.warehouseId} onChange={(event) => setConsumableTargets((current) => ({ ...current, [balance.id]: { ...target, warehouseId: event.target.value, projectId: event.target.value ? "" : target.projectId } }))}>
                      <option value="">إلى مستودع</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                    </select>
                    <select className="h-10 rounded-xl border border-border bg-background px-3" value={target.projectId} onChange={(event) => setConsumableTargets((current) => ({ ...current, [balance.id]: { ...target, projectId: event.target.value, warehouseId: event.target.value ? "" : target.warehouseId } }))}>
                      <option value="">إلى مشروع</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    <Button disabled={transferConsumableMutation.isPending || (!target.warehouseId && !target.projectId)} onClick={() => void transferConsumableMutation.mutateAsync({ inventoryEntryId: balance.inventoryEntryId, quantity: Number(target.quantity), fromWarehouseId: balance.warehouseId, fromProjectId: balance.projectId, toWarehouseId: target.warehouseId || null, toProjectId: target.projectId || null })}>تحويل الكمية</Button>
                  </div>
                </div>
              )
            })}
            {detail && detail.consumableBalances.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أرصدة مواد حالية لهذه الفاتورة.</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="سجل الحركات" description="كل المشتريات والتحويلات تبقى محفوظة هنا كسجل تاريخي." />
          <div className="grid gap-2">
            {detail?.movements.map((movement) => (
              <div key={movement.id} className="rounded-xl border border-border/70 px-4 py-3 text-sm">
                <div className="font-medium text-foreground">{movement.movementType === "PURCHASE" ? "شراء" : "تحويل"} - {movement.itemType === "ASSET" ? "أصل" : "مادة"}</div>
                <div className="text-muted-foreground">{new Date(movement.occurredAt).toLocaleString("ar-DZ")}</div>
              </div>
            ))}
            {detail && detail.movements.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد حركات مسجلة بعد.</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="ملفات الفاتورة" description="الملفات المرفوعة والمرتبطة بهذه الفاتورة." />
          <div className="grid gap-3">
            {detail?.attachments.map((attachment) => (
              isDesktop ? (
                <button
                  key={attachment.id}
                  className="rounded-xl border border-border/70 px-4 py-3 text-start text-sm transition hover:bg-muted/30"
                  type="button"
                  onClick={() => void handleAttachmentOpen(attachment)}
                >
                  {attachment.originalName}
                </button>
              ) : (
                <a key={attachment.id} className="rounded-xl border border-border/70 px-4 py-3 text-sm transition hover:bg-muted/30" href={resolveApiUrl(`/api/inventory/attachments/${attachment.id}`)} rel="noreferrer" target="_blank">
                  {attachment.originalName}
                </a>
              )
            ))}
            {detail && detail.attachments.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد ملفات مرفوعة لهذه الفاتورة.</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>

      <RecordInvoicePaymentDialog invoiceDetail={detail ?? null} open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} onSuccess={() => invoiceQuery.refetch()} />
    </div>
  )
}
