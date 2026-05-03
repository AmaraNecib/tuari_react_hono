import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/form-controls";
import { PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";
import { AppShellFilterShell, usePaginatedRows } from "@/features/app-shell/app-shell-table-primitives";
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls";
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

export function AuditLogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [domain, setDomain] = useState("ALL");
  const [action, setAction] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch audit logs from API
  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ["systemLogList"],
    queryFn: async () => {
      const result = await (rpcClient as any).systemLogList({});
      return result?.items ?? [];
    },
  });

  const logs = useMemo(() => {
    if (!apiResponse) return [];

    // Map API response to AuditLog interface
    return apiResponse.map((entry: any) => ({
      id: entry.id,
      timestamp: entry.createdAt,
      actor: entry.actorLabel ?? entry.actorCurrentLabel ?? "غير معروف",
      domain: entry.entityType ?? "unknown",
      action: entry.actionType ?? "unknown",
      resourceId: entry.entityId ?? "",
      changes: entry.summary ?? "",
    }));
  }, [apiResponse]);

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

    if (startDate) {
      result = result.filter((log: AuditLog) => new Date(log.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      result = result.filter((log: AuditLog) => new Date(log.timestamp) <= new Date(endDate));
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
          description="عرض ومراجعة جميع التغييرات والعمليات المنفذة في النظام"
          action={
            filteredLogs.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                تصدير CSV
              </Button>
            )
          }
        />

        <AppShellFilterShell>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">البحث</span>
            <Input
              placeholder="ابحث عن مستخدم أو مورد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">النطاق</span>
            <NativeSelect value={domain} onChange={(e: any) => setDomain(e.target.value)}>
              <option value="ALL">الكل</option>
              <option value="المخزون">المخزون</option>
              <option value="الديون">الديون</option>
              <option value="الموظفون">الموظفون</option>
              <option value="المشاريع">المشاريع</option>
            </NativeSelect>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">الإجراء</span>
            <NativeSelect value={action} onChange={(e: any) => setAction(e.target.value)}>
              <option value="ALL">الكل</option>
              <option value="create">إنشاء</option>
              <option value="update">تحديث</option>
              <option value="delete">حذف</option>
            </NativeSelect>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">من</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">إلى</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </AppShellFilterShell>

        {isLoading && (
          <div className="rounded-lg border border-border/60 bg-background/10 p-8 text-center">
            <p className="text-muted-foreground">جاري تحميل السجل...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">
            خطأ في تحميل السجل: {error instanceof Error ? error.message : "حدث خطأ"}
          </div>
        )}

        {!isLoading && !error && filteredLogs.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/10 p-8 text-center">
            <p className="text-muted-foreground">لا توجد عمليات مطابقة للفلاتر</p>
          </div>
        ) : (!isLoading && !error) && (
          <div className="space-y-3">
            {pagedLogs.map((log: unknown) => {
              const auditLog = log as AuditLog;
              return (
                <div key={auditLog.id} className="rounded-lg border border-border/60 bg-background/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">
                          {auditLog.domain}
                        </span>
                        <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">
                          {auditLog.action === "create" && "إنشاء"}
                          {auditLog.action === "update" && "تحديث"}
                          {auditLog.action === "delete" && "حذف"}
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
