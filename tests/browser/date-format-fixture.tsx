import { createRoot } from "react-dom/client"
import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "../../apps/web/src/i18n"
import "../../apps/web/src/styles.css"
import { ExpensesPage } from "../../apps/web/src/features/expenses/expenses-page"
import { SystemLogSection } from "../../apps/web/src/features/app-shell/system-log-section"
import { DateFormatSetting } from "../../apps/web/src/features/preferences/date-format-setting"
import { AppDate } from "../../apps/web/src/components/app-date"
import { DatePicker } from "../../apps/web/src/components/ui/date-picker"
import { formatDateRange } from "../../apps/web/src/features/app-shell/home-view-derived-formatters"

// This fixture replaces query hooks with synthetic data, never the date formatter or Intl.
function Fixture() {
  const [direction, setDirection] = useState<"rtl" | "ltr">("rtl")
  const entry = { id: "synthetic-log", actionType: "EMPLOYEE_CREATED", entityType: "EMPLOYEE", entityId: "synthetic", actorUserId: "synthetic", transactionId: "synthetic-transaction", actorLabel: "مستخدم تجريبي", actorCurrentLabel: null, entityLabel: "موظف تجريبي", summary: "إنشاء تجريبي", detail: "بيانات تجريبية فقط", createdAt: "2026-11-10T12:04:05Z" } as const
  return (
    <main dir={direction} className="mx-auto max-w-5xl space-y-6 p-4">
      <label>اتجاه الاختبار <select aria-label="اتجاه الاختبار" value={direction} onChange={(event) => setDirection(event.target.value as "rtl" | "ltr")}><option value="rtl">RTL</option><option value="ltr">LTR</option></select></label>
      <section data-testid="setting" className="rounded-xl border border-line bg-surface p-5"><h1>إعدادات عرض التاريخ</h1><DateFormatSetting /></section>
      <section data-testid="empty-picker" className="max-w-sm"><DatePicker value="" name="syntheticDay" onChange={() => undefined} /></section>
      <section data-testid="prose" className="rounded-xl border border-line p-4">التاريخ المحدد <AppDate value="2026-04-23T12:04:05Z" /> في هذا السجل.</section>
      <section data-testid="range" className="rounded-xl border border-line p-4">الفترة {formatDateRange("2026-04-23", "2026-05-24", "مستمر")}</section>
      <section data-testid="expenses"><ExpensesPage projects={[]} employees={[]} sellers={[]} /></section>
      <section data-testid="audit"><SystemLogSection entries={[entry]} filters={{}} onFiltersChange={() => undefined} query={{ data: [entry], isPending: false, isError: false, isFetching: false, error: null, refetch: async () => undefined }} title="سجل النظام التجريبي" /></section>
    </main>
  )
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><Fixture /></QueryClientProvider>)
