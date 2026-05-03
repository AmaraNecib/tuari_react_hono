import { useInventoryReport, useDebtReport } from "@/hooks/use-report-queries";
import { PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";
import { Button } from "@/components/ui/button";

export function DashboardOverview() {
  const inventoryReport = useInventoryReport();
  const debtReport = useDebtReport();

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title="لوحة التحكم"
          description="نظرة عامة على الحالة الحالية للمخزون والديون والحركات"
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Value Summary Card */}
          <div className="rounded-lg border border-border/60 bg-background/10 p-4">
            <p className="text-sm text-muted-foreground">إجمالي القيمة</p>
            <div className="mt-2 space-y-1">
              {inventoryReport.isLoading ? (
                <p className="text-lg font-bold">جاري التحميل...</p>
              ) : inventoryReport.data ? (
                <>
                  <p className="text-2xl font-bold">
                    {(inventoryReport.data as any).summary.totalValueDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                  <p className="text-xs text-muted-foreground">
                    أصول: {(inventoryReport.data as any).summary.totalAssetsDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                </>
              ) : (
                <p className="text-lg">لا توجد بيانات</p>
              )}
            </div>
          </div>

          {/* Debt Summary Card */}
          <div className="rounded-lg border border-border/60 bg-background/10 p-4">
            <p className="text-sm text-muted-foreground">الديون المتبقية</p>
            <div className="mt-2 space-y-1">
              {debtReport.isLoading ? (
                <p className="text-lg font-bold">جاري التحميل...</p>
              ) : debtReport.data ? (
                <>
                  <p className="text-2xl font-bold">
                    {(debtReport.data as any).summary.totalOutstandingDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                  <p className="text-xs text-muted-foreground">
                    متأخرة: {(debtReport.data as any).summary.overdueDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                </>
              ) : (
                <p className="text-lg">لا توجد بيانات</p>
              )}
            </div>
          </div>

          {/* Aging Analysis Card */}
          <div className="rounded-lg border border-border/60 bg-background/10 p-4">
            <p className="text-sm text-muted-foreground">تحليل الأعمار</p>
            <div className="mt-2 space-y-1">
              {debtReport.isLoading ? (
                <p className="text-sm">جاري التحميل...</p>
              ) : debtReport.data ? (
                <>
                  {(debtReport.data as any).agingBreakdown.slice(0, 2).map((item: any) => (
                    <div key={item.ageCategory} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {item.ageCategory === "0-30_DAYS" && "0-30 يوم"}
                        {item.ageCategory === "31-60_DAYS" && "31-60 يوم"}
                        {item.ageCategory === "60+_DAYS" && "60+ يوم"}
                      </span>
                      <span className="font-medium">{item.countOpen}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm">لا توجد بيانات</p>
              )}
            </div>
          </div>

          {/* Top Debtors Card */}
          <div className="rounded-lg border border-border/60 bg-background/10 p-4">
            <p className="text-sm text-muted-foreground">أكبر المدينين</p>
            <div className="mt-2 space-y-1">
              {debtReport.isLoading ? (
                <p className="text-sm">جاري التحميل...</p>
              ) : debtReport.data && (debtReport.data as any).topDebtors.length > 0 ? (
                <>
                  <div className="text-sm font-medium">
                    {(debtReport.data as any).topDebtors[0].partyName}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(debtReport.data as any).topDebtors[0].amountDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                </>
              ) : (
                <p className="text-sm">لا توجد ديون</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 rounded-lg border border-border/60 bg-background/10 p-4">
          <p className="mb-3 text-sm font-medium">الإجراءات السريعة</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">إضافة فاتورة</Button>
            <Button variant="outline" size="sm">تسجيل دفعة</Button>
            <Button variant="outline" size="sm">تحويل مخزون</Button>
            <Button variant="outline" size="sm">عرض التقارير</Button>
          </div>
        </div>

        {/* Loading or Error States */}
        {(inventoryReport.error || debtReport.error) && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            خطأ في تحميل بعض البيانات. حاول التحديث.
          </div>
        )}
      </PageSurfaceContent>
    </Surface>
  );
}
