/**
 * Report builder component for creating custom reports.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form-controls";
import { PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";
import { DateRangeFilter } from "@/features/shared/table-primitives";
import { useReportQuery, formatReportAsCSV } from "@/hooks/use-report-queries";

type ReportType = "INVENTORY" | "DEBT" | "MOVEMENT";

/**
 * @description Component
 */
export function ReportBuilder() {
  const { t } = useTranslation()
  const [reportType, setReportType] = useState<ReportType>("INVENTORY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showReport, setShowReport] = useState(false);

  const inventoryReport = useReportQuery(
    { type: "INVENTORY", startDate: startDate || undefined, endDate: endDate || undefined },
    showReport && reportType === "INVENTORY"
  );
  const debtReport = useReportQuery(
    { type: "DEBT", startDate: startDate || undefined, endDate: endDate || undefined },
    showReport && reportType === "DEBT"
  );
  const movementReport = useReportQuery(
    { type: "MOVEMENT", startDate: startDate || undefined, endDate: endDate || undefined },
    showReport && reportType === "MOVEMENT"
  );

  const currentReport = reportType === "INVENTORY" ? inventoryReport : reportType === "DEBT" ? debtReport : movementReport;
  const isLoading = currentReport.isLoading;
  const data = currentReport.data;
  const error = currentReport.error;

  const handleGenerateReport = () => {
    setShowReport(true);
  };

  const handleDownloadCSV = () => {
    if (!data) return;
    const csv = formatReportAsCSV(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `report-${reportType.toLowerCase()}-${Date.now()}.csv`;
    link.click();
  };

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title="تقارير مالية"
          description="إنشاء تقارير شاملة عن المخزون والديون والحركات"
        />

        {/* Report Generator Controls */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-border/60 bg-surface p-4">
          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">نوع التقرير</span>
            <NativeSelect value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
              <option value="INVENTORY">تقرير المخزون</option>
              <option value="DEBT">تقرير الديون</option>
              <option value="MOVEMENT">تقرير الحركات</option>
            </NativeSelect>
          </label>

          <DateRangeFilter
            fromLabel="من التاريخ"
            toLabel="إلى التاريخ"
            fromDate={startDate}
            toDate={endDate}
            onFromDateChange={setStartDate}
            onToDateChange={setEndDate}
          />

          <div className="flex items-end">
            <Button onClick={handleGenerateReport} disabled={isLoading}>
              {isLoading ? t("common.loading", "جاري التحميل...") : t("reports.generate")}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            خطأ في إنشاء التقرير: {error.message}
          </div>
        )}

        {/* Report Display */}
        {data && !isLoading && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {reportType === "INVENTORY" ? "تقرير المخزون" : reportType === "DEBT" ? "تقرير الديون" : "تقرير الحركات"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("reports.generatedAt")} {new Date(data.generatedAt).toLocaleString("ar-DZ")}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
                تحميل CSV
              </Button>
            </div>

            {/* Summary Cards */}
            {reportType === "INVENTORY" && data.type === "INVENTORY" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">إجمالي الأصول</p>
                  <p className="text-2xl font-bold">{data.summary.totalAssetsDzd.toLocaleString("ar-DZ")} د.ج</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">إجمالي المستهلكات</p>
                  <p className="text-2xl font-bold">{data.summary.totalConsumablesDzd.toLocaleString("ar-DZ")} د.ج</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">القيمة الإجمالية</p>
                  <p className="text-2xl font-bold">{data.summary.totalValueDzd.toLocaleString("ar-DZ")} د.ج</p>
                </div>
              </div>
            )}

            {reportType === "DEBT" && data.type === "DEBT" && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">الديون المتبقية</p>
                  <p className="text-2xl font-bold">{data.summary.totalOutstandingDzd.toLocaleString("ar-DZ")} د.ج</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">الديون المسددة</p>
                  <p className="text-2xl font-bold">{data.summary.totalSettledDzd.toLocaleString("ar-DZ")} د.ج</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">الديون المتأخرة</p>
                  <p className="text-2xl font-bold">{data.summary.overdueDzd.toLocaleString("ar-DZ")} د.ج</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">عدد الأطراف</p>
                  <p className="text-2xl font-bold">{data.summary.partyCount}</p>
                </div>
              </div>
            )}

            {reportType === "MOVEMENT" && data.type === "MOVEMENT" && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">إجمالي الحركات</p>
                  <p className="text-2xl font-bold">{data.summary.totalMovements}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{t("reports.assetTransfers")}</p>
                  <p className="text-2xl font-bold">{data.summary.assetTransfers}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{t("reports.consumableTransfers")}</p>
                  <p className="text-2xl font-bold">{data.summary.consumableTransfers}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">المبيعات الخارجية</p>
                  <p className="text-2xl font-bold">{data.summary.outboundSales}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </PageSurfaceContent>
    </Surface>
  );
}
