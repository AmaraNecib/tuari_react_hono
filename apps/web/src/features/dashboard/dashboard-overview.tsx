import { useTranslation } from "react-i18next";

import { useInventoryReport, useDebtReport } from "@/hooks/use-report-queries";
import type { DebtReport, InventoryReport } from "@tuari/contracts";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";

export function DashboardOverview() {
  const { t } = useTranslation();
  const inventoryReport = useInventoryReport();
  const debtReport = useDebtReport();

  const inventoryData = inventoryReport.data as InventoryReport | undefined;
  const debtData = debtReport.data as DebtReport | undefined;

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title={t("dashboardPage.title")}
          description={t("dashboardPage.description")}
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Value Summary Card */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <p className="text-sm text-muted-foreground">{t("dashboardPage.totalValue")}</p>
            <div className="mt-2 space-y-1">
              {inventoryReport.isLoading ? (
                <p className="text-lg font-bold">{t("common.loading")}</p>
              ) : inventoryData?.summary?.totalValueDzd ? (
                <>
                  <p className="text-2xl font-bold">
                    {inventoryData.summary.totalValueDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboardPage.assets")}: {inventoryData.summary.totalAssetsDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                </>
              ) : (
                <p className="text-lg">{t("dashboardPage.noData")}</p>
              )}
            </div>
          </div>

          {/* Debt Summary Card */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <p className="text-sm text-muted-foreground">{t("dashboardPage.outstandingDebts")}</p>
            <div className="mt-2 space-y-1">
              {debtReport.isLoading ? (
                <p className="text-lg font-bold">{t("common.loading")}</p>
              ) : debtData?.summary?.totalOutstandingDzd !== undefined ? (
                <>
                  <p className="text-2xl font-bold">
                    {debtData.summary.totalOutstandingDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboardPage.overdue")}: {debtData.summary.overdueDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                </>
              ) : (
                <p className="text-lg">{t("dashboardPage.noData")}</p>
              )}
            </div>
          </div>

          {/* Aging Analysis Card */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <p className="text-sm text-muted-foreground">{t("dashboardPage.agingAnalysis")}</p>
            <div className="mt-2 space-y-1">
              {debtReport.isLoading ? (
                <p className="text-sm">{t("common.loading")}</p>
              ) : debtData?.agingBreakdown ? (
                <>
                  {debtData.agingBreakdown.slice(0, 2).map((item) => (
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
                <p className="text-sm">{t("dashboardPage.noData")}</p>
              )}
            </div>
          </div>

          {/* Top Debtors Card */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <p className="text-sm text-muted-foreground">{t("dashboardPage.topDebtors")}</p>
            <div className="mt-2 space-y-1">
              {debtReport.isLoading ? (
                <p className="text-sm">{t("common.loading")}</p>
              ) : debtData?.topDebtors?.[0] ? (
                <>
                  <div className="text-sm font-medium">
                    {debtData.topDebtors[0].partyName}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {debtData.topDebtors[0].amountDzd.toLocaleString("ar-DZ")} د.ج
                  </p>
                </>
              ) : (
                <p className="text-sm">{t("dashboardPage.noDebts")}</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 rounded-xl border border-border/60 bg-surface p-4">
          <p className="mb-3 text-sm font-medium">{t("dashboardPage.quickActions")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">{t("dashboardPage.addInvoice")}</Button>
            <Button variant="outline" size="sm">{t("dashboardPage.recordPayment")}</Button>
            <Button variant="outline" size="sm">{t("dashboardPage.transferStock")}</Button>
            <Button variant="outline" size="sm">{t("dashboardPage.viewReports")}</Button>
          </div>
        </div>

        {/* Loading or Error States */}
        {(inventoryReport.error || debtReport.error) && (
          <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {t("dashboardPage.loadError")}
          </div>
        )}
      </PageSurfaceContent>
    </Surface>
  );
}
