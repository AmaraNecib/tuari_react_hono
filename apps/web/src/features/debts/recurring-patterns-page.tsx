import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives";
import { useRecurringPatternsQuery, formatNextOccurrence, calculateDaysUntilOccurrence } from "@/hooks/use-recurring-patterns";

export function RecurringPatternsPage() {
  const patternsQuery = useRecurringPatternsQuery();
  const [searchQuery, setSearchQuery] = useState("");

  const patterns = patternsQuery.data?.items ?? [];
  const filteredPatterns = patterns.filter((p: any) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          title="الأنماط المتكررة"
          description="إنشاء وإدارة العمليات المتكررة التي تحدث بشكل منتظم"
          action={
            <PageActionGroup>
              <Button>نمط جديد</Button>
            </PageActionGroup>
          }
        />

        <div className="mb-4">
          <Input
            placeholder="بحث في الأنماط..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {patternsQuery.isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        ) : patternsQuery.error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            خطأ في تحميل الأنماط
          </div>
        ) : filteredPatterns.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/10 p-8 text-center">
            <p className="text-muted-foreground">لا توجد أنماط متكررة</p>
            <Button className="mt-4">إنشاء نمط أول</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPatterns.map((pattern: any) => {
              const daysUntil = calculateDaysUntilOccurrence(pattern);
              const statusColor = daysUntil !== null && daysUntil <= 3 ? "text-amber-600" : "text-green-600";

              return (
                <div key={pattern.id} className="rounded-lg border border-border/60 bg-background/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="font-medium">{pattern.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {pattern.description}
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <span>
                          التكرار:{" "}
                          {pattern.frequency === "DAILY" && "يومي"}
                          {pattern.frequency === "WEEKLY" && "أسبوعي"}
                          {pattern.frequency === "MONTHLY" && "شهري"}
                          {pattern.frequency === "CUSTOM" && "مخصص"}
                        </span>
                        <span>
                          المبلغ:{" "}
                          {pattern.fixedAmountDzd
                            ? `${pattern.fixedAmountDzd.toLocaleString("ar-DZ")} د.ج`
                            : "صيغة"}
                        </span>
                        <span className={statusColor}>
                          التكرار التالي: {formatNextOccurrence(pattern)}
                          {daysUntil !== null && daysUntil >= 0 && ` (خلال ${daysUntil} يوم)`}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        تعديل
                      </Button>
                      <Button
                        variant={pattern.isActive ? "outline" : "ghost"}
                        size="sm"
                      >
                        {pattern.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageSurfaceContent>
    </Surface>
  );
}
