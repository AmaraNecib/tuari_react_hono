import { showErrorToast } from "@/lib/toast"
import { FailureCode } from "@/lib/failure-code"
import { i18n as featureI18n } from "@/i18n"
/**
 * Report builder component for creating custom reports.
 */
import { CurrencyRun } from "@/features/shared/money-value"
import { formatExactMoney } from "@/features/shared/exact-money-display"
import { useState } from "react";
import { AppDate } from "@/components/app-date";
import { useTranslation } from "react-i18next";
import { DEBT_BALANCE_STATE_PHRASE } from "@tuari/contracts";
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
    try {
      const csv = formatReportAsCSV(data);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `report-${reportType.toLowerCase()}-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      showErrorToast(featureI18n.t("featureCopy.reportBuilder.generateError"));
    }
  };

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title={featureI18n.t("featureCopy.reportBuilder.title")}
          description={featureI18n.t("featureCopy.reportBuilder.description")}
        />

        {/* Report Generator Controls */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-border/60 bg-surface p-4">
          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">{featureI18n.t("featureCopy.reportBuilder.reportType")}</span>
            <NativeSelect value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
              <option value="INVENTORY">{featureI18n.t("featureCopy.reportBuilder.inventoryReport")}</option>
              <option value="DEBT">{featureI18n.t("featureCopy.reportBuilder.debtReport")}</option>
              <option value="MOVEMENT">{featureI18n.t("featureCopy.reportBuilder.movementReport")}</option>
            </NativeSelect>
          </label>

          <DateRangeFilter
            fromLabel={featureI18n.t("featureCopy.reportBuilder.dateFrom")}
            toLabel={featureI18n.t("featureCopy.reportBuilder.dateTo")}
            fromDate={startDate}
            toDate={endDate}
            onFromDateChange={setStartDate}
            onToDateChange={setEndDate}
          />

          <div className="flex items-end">
            <Button onClick={handleGenerateReport} disabled={isLoading}>
              {isLoading ? t("common.loading") : t("reports.generate")}
            </Button>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {featureI18n.t("featureCopy.reportBuilder.generateError")}<FailureCode error={error} attempt={currentReport.errorUpdatedAt} />
          </div>
        )}

        {/* Report Display */}
        {data && !isLoading && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {reportType === "INVENTORY" ? featureI18n.t("featureCopy.reportBuilder.inventoryReport") : reportType === "DEBT" ? featureI18n.t("featureCopy.reportBuilder.debtReport") : featureI18n.t("featureCopy.reportBuilder.movementReport")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("reports.generatedAt")} {<AppDate value={data.generatedAt} includeTime timeStyle="medium" />}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
                {featureI18n.t("featureCopy.reportBuilder.downloadCsv")}</Button>
            </div>

            {/* Summary Cards */}
            {reportType === "INVENTORY" && data.type === "INVENTORY" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.assets")}</p>
                  <p className="text-2xl font-bold"><CurrencyRun amount={formatExactMoney(data.summary.totalAssetsDzd, { aggregate: true }).text} currencyLabel={featureI18n.t("featureCopy.reportBuilder.currency")} /></p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.consumables")}</p>
                  <p className="text-2xl font-bold"><CurrencyRun amount={formatExactMoney(data.summary.totalConsumablesDzd, { aggregate: true }).text} currencyLabel={featureI18n.t("featureCopy.reportBuilder.currency")} /></p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.totalValue")}</p>
                  <p className="text-2xl font-bold"><CurrencyRun amount={formatExactMoney(data.summary.totalValueDzd, { aggregate: true }).text} currencyLabel={featureI18n.t("featureCopy.reportBuilder.currency")} /></p>
                </div>
              </div>
            )}

            {reportType === "DEBT" && data.type === "DEBT" && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.outstanding")}</p>
                  <p className="text-2xl font-bold"><CurrencyRun amount={formatExactMoney(data.summary.totalOutstandingDzd, { aggregate: true }).text} currencyLabel={featureI18n.t("featureCopy.reportBuilder.currency")} /></p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.settled")}</p>
                  <p className="text-2xl font-bold"><CurrencyRun amount={formatExactMoney(data.summary.totalSettledDzd, { aggregate: true }).text} currencyLabel={featureI18n.t("featureCopy.reportBuilder.currency")} /></p>
                  <p className="text-xs font-medium text-muted-foreground">{DEBT_BALANCE_STATE_PHRASE.settled}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.overdue")}</p>
                  <p className="text-2xl font-bold"><CurrencyRun amount={formatExactMoney(data.summary.overdueDzd, { aggregate: true }).text} currencyLabel={featureI18n.t("featureCopy.reportBuilder.currency")} /></p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.partyCount")}</p>
                  <p className="text-2xl font-bold">{data.summary.partyCount}</p>
                </div>
              </div>
            )}

            {reportType === "MOVEMENT" && data.type === "MOVEMENT" && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-surface p-4">
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.totalMovements")}</p>
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
                  <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.reportBuilder.outboundCount")}</p>
                  <p className="text-2xl font-bold">{data.summary.outboundSales}</p>
                </div>
              </div>
            )}
            {data.type === "MOVEMENT" && (
              <section aria-label={featureI18n.t("featureCopy.reportBuilder.outboundDocuments")} className="space-y-2">
                <h4 className="font-semibold">{featureI18n.t("featureCopy.reportBuilder.outboundDocuments")}</h4>
                <dl className="flex flex-wrap gap-4">
                  {data.outboundDocuments.map((row) => (
                    <div key={row.transferType}>
                      <dt><bdi dir="ltr">{row.transferType}</bdi></dt>
                      <dd>{row.count}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        )}
      </PageSurfaceContent>
    </Surface>
  );
}
