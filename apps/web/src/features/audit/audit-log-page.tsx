import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/form-controls";
import { PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";
import { AppShellFilterShell, usePaginatedRows } from "@/features/app-shell/app-shell-table-primitives";
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls";

interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  domain: string;
  action: string;
  resourceId: string;
  changes: string;
}

// Mock data for demo
const mockLogs: AuditLog[] = [
  {
    id: "1",
    timestamp: new Date().toISOString(),
    actor: "المستخدم الأول",
    domain: "المخزون",
    action: "create",
    resourceId: "invoice-123",
    changes: "تم إنشاء فاتورة جديدة",
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    actor: "المستخدم الثاني",
    domain: "الديون",
    action: "update",
    resourceId: "debt-456",
    changes: "تم تحديث مبلغ الدين",
  },
];

export function AuditLogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [domain, setDomain] = useState("ALL");
  const [action, setAction] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredLogs = useMemo(() => {
    let result = mockLogs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.actor.toLowerCase().includes(q) ||
          log.resourceId.toLowerCase().includes(q) ||
          log.changes.toLowerCase().includes(q)
      );
    }

    if (domain !== "ALL") {
      result = result.filter((log) => log.domain === domain);
    }

    if (action !== "ALL") {
      result = result.filter((log) => log.action === action);
    }

    if (startDate) {
      result = result.filter((log) => new Date(log.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      result = result.filter((log) => new Date(log.timestamp) <= new Date(endDate));
    }

    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [searchQuery, domain, action, startDate, endDate]);

  const { page, pageSize, pagedRows: pagedLogs, setPage, setPageSize } = usePaginatedRows({
    rows: filteredLogs,
    initialPageSize: 20,
    resetPageDeps: [searchQuery, domain, action, startDate, endDate],
  });

  const handleExportCSV = () => {
    const headers = ["التاريخ", "المستخدم", "النطاق", "الإجراء", "معرف المورد", "التغييرات"];
    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toLocaleString("ar-DZ"),
      log.actor,
      log.domain,
      log.action,
      log.resourceId,
      log.changes,
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
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

        {filteredLogs.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/10 p-8 text-center">
            <p className="text-muted-foreground">لا توجد عمليات مطابقة للفلاتر</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pagedLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border/60 bg-background/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">
                        {log.domain}
                      </span>
                      <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">
                        {log.action === "create" && "إنشاء"}
                        {log.action === "update" && "تحديث"}
                        {log.action === "delete" && "حذف"}
                      </span>
                    </div>
                    <div className="text-sm font-medium">{log.changes}</div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>{log.actor}</span>
                      <span>{log.resourceId}</span>
                      <span>{new Date(log.timestamp).toLocaleString("ar-DZ")}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
