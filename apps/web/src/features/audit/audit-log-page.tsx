import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { SystemLogEntry } from "@tuari/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/form-controls";
import { PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";
import { AppShellFilterShell, DateRangeFilter, usePaginatedRows } from "@/features/shared/table-primitives";
import { TablePaginationControls } from "@/features/shared/table-pagination-controls";
import { isInstantWithinBounds, resolveDayRangeBounds } from "@/lib/date-range";
import { rpcClient } from "@/lib/orpc-client";

interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  domain: string;
  action: string;
  resourceId: string;
  changes: string;
}

/** Audit log page with date filtering and search. */
/**
 * @description Component
 */
export function AuditLogPage() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("");
  const [domain, setDomain] = useState("ALL");
  const [action, setAction] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch audit logs from API
  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ["systemLogList"],
    queryFn: async () => {
      const result = await rpcClient.systemLogList({});
      return result?.items ?? [];
    },
  });

  const logs = useMemo(() => {
    if (!apiResponse) return [];

    // Map API response to AuditLog interface
    return apiResponse.map((entry: SystemLogEntry) => ({
      id: entry.id,
      timestamp: entry.createdAt,
      actor: entry.actorLabel ?? entry.actorCurrentLabel ?? t("systemLog.actorUnknown"),
      domain: entry.entityType ?? "unknown",
      action: entry.actionType ?? "unknown",
      resourceId: entry.entityId ?? "",
      changes: entry.summary ?? "",
    }));
  }, [apiResponse, t]);

  const filteredLogs = useMemo((): AuditLog[] => {
    let result = logs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (log: AuditLog) =>
          log.actor.toLowerCase().includes(q) ||
          log.resourceId.toLowerCase().includes(q) ||
          log.changes.toLowerCase().includes(q)
      );
    }

    if (domain !== "ALL") {
      result = result.filter((log: AuditLog) => log.domain === domain);
    }

    if (action !== "ALL") {
      result = result.filter((log: AuditLog) => log.action === action);
    }

    if (startDate || endDate) {
      // Expand the picked days to inclusive Algeria bounds once, then reuse
      // them for every row: a log written at 23:59 on the picked end date is
      // inside the range, not dropped by a bare `yyyy-MM-dd` parsing as UTC
      // midnight.
      const bounds = resolveDayRangeBounds({
        fromDate: startDate || undefined,
        toDate: endDate || undefined,
      });
      result = result.filter((log: AuditLog) => isInstantWithinBounds(log.timestamp, bounds));
    }

    return result.sort((a: AuditLog, b: AuditLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs, searchQuery, domain, action, startDate, endDate]);

  const { page, pageSize, pagedRows: pagedLogs, setPage, setPageSize } = usePaginatedRows({
    rows: filteredLogs,
    initialPageSize: 20,
    resetPageDeps: [searchQuery, domain, action, startDate, endDate],
  });

  const handleExportCSV = () => {
    const headers = ["التاريخ", "المستخدم", "النطاق", "الإجراء", "معرف المورد", "التغييرات"];
    const rows = filteredLogs.map((log: AuditLog) => [
      new Date(log.timestamp).toLocaleString("ar-DZ"),
      log.actor,
      log.domain,
      log.action,
      log.resourceId,
      log.changes,
    ]);

    const csv = [headers, ...rows].map((row: (string | number)[]) => row.map((cell: string | number) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `audit-log-${Date.now()}.csv`;
    link.click();
  };

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title="سجل التدقيق"
          description={t("auditLog.description")}
          action={
            filteredLogs.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                {t("auditLog.exportCsv")}
              </Button>
            )
          }
        />

        <AppShellFilterShell>
          <label className="flex flex-col gap-2 min-w-[14rem]">
            <span className="text-sm font-medium text-foreground">{t("auditLog.search")}</span>
            <Input
              placeholder={t("auditLog.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">{t("auditLog.domain")}</span>
            <NativeSelect value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="ALL">{t("common.all")}</option>
              <option value="المخزون">{t("auditLog.domainInventory")}</option>
              <option value="الديون">{t("auditLog.domainDebts")}</option>
              <option value="الموظفون">{t("auditLog.domainEmployees")}</option>
              <option value="المشاريع">{t("auditLog.domainProjects")}</option>
            </NativeSelect>
          </label>

          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">{t("auditLog.action")}</span>
            <NativeSelect value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="ALL">{t("common.all")}</option>
              <option value="create">{t("historyEvent.created")}</option>
              <option value="update">{t("historyEvent.updated")}</option>
              <option value="delete">{t("common.delete")}</option>
            </NativeSelect>
          </label>

          <DateRangeFilter
            fromLabel={t("common.dateFrom", "من التاريخ")}
            toLabel={t("common.dateTo", "إلى التاريخ")}
            fromDate={startDate}
            toDate={endDate}
            onFromDateChange={setStartDate}
            onToDateChange={setEndDate}
          />
        </AppShellFilterShell>

        {isLoading && (
          <div className="rounded-lg border border-border/60 bg-surface p-8 text-center">
            <p className="text-muted-foreground">{t("systemLog.loading", "جاري تحميل السجل...")}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">
            {t("auditLog.loadError")} {error instanceof Error ? error.message : t("common.error")}
          </div>
        )}

        {!isLoading && !error && filteredLogs.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-surface p-8 text-center">
            <p className="text-muted-foreground">{t("auditLog.noResults")}</p>
          </div>
        ) : (!isLoading && !error) && (
          <div className="space-y-3">
            {pagedLogs.map((log: unknown) => {
              const auditLog = log as AuditLog;
              return (
                <div key={auditLog.id} className="rounded-lg border border-border/60 bg-surface p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">
                          {auditLog.domain}
                        </span>
                        <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">
                          {auditLog.action === "create" && t("historyEvent.created")}
                          {auditLog.action === "update" && t("historyEvent.updated")}
                          {auditLog.action === "delete" && t("common.delete")}
                        </span>
                      </div>
                      <div className="text-sm font-medium">{auditLog.changes}</div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>{auditLog.actor}</span>
                        <span>{auditLog.resourceId}</span>
                        <span>{new Date(auditLog.timestamp).toLocaleString("ar-DZ")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredLogs.length > pageSize && (
          <TablePaginationControls
            page={page}
            pageSize={pageSize}
            totalCount={filteredLogs.length}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize: number) => {
              setPage(1);
              setPageSize(nextPageSize);
            }}
          />
        )}
      </PageSurfaceContent>
    </Surface>
  );
}
