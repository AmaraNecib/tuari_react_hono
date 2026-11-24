import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  exportSupportBundle,
  getRecentDiagnosticEvents,
  type RecentDiagnosticEvents,
} from "@/lib/runtime-bridge";

import { formatErrorCode } from "@/lib/error-correlation";
import { showErrorToast } from "@/lib/toast";

export function DiagnosticsSettings() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<RecentDiagnosticEvents | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void getRecentDiagnosticEvents().then((result) => {
      if (active) setData(result);
    }).catch(() => {
      if (active) {
        setMessage(t("settings.diagnostics.loadError"));
        showErrorToast(t("settings.diagnostics.loadError"));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [t]);

  async function saveBundle() {
    setSaving(true);
    setMessage("");
    try {
      const result = await exportSupportBundle();
      if (result.status === "saved") setMessage(t("settings.diagnostics.saved"));
    } catch {
      setMessage(t("settings.diagnostics.saveError"));
      showErrorToast(t("settings.diagnostics.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const rtl = i18n.language.startsWith("ar");
  const localizedValue = (group: "level" | "category", value: string) => {
    const key = `settings.diagnostics.values.${group}.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };
  return (
    <section className="space-y-4" dir={rtl ? "rtl" : "ltr"} aria-labelledby="diagnostics-title">
      <div className="rounded-xl border border-line p-5">
        <h2 id="diagnostics-title" className="text-lg font-semibold">{t("settings.diagnostics.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("settings.diagnostics.description")}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("settings.diagnostics.enabled")}</dt><dd>{data === null ? "—" : data.status.enabled ? t("common.yes") : t("common.no")}</dd></div>
          <div><dt className="text-muted-foreground">{t("settings.diagnostics.initialized")}</dt><dd>{data === null ? "—" : data.status.initialized ? t("common.yes") : t("common.no")}</dd></div>
          <div><dt className="text-muted-foreground">{t("settings.diagnostics.buffered")}</dt><dd>{data?.status.bufferedEventCount ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("settings.diagnostics.dropped")}</dt><dd>{data?.status.droppedEventCount ?? "—"}</dd></div>
        </dl>
      </div>
      <div className="rounded-xl border border-line p-5">
        <h3 className="font-semibold">{t("settings.diagnostics.recentEvents")}</h3>
        {loading ? <p className="mt-3 text-sm">{t("common.loading")}</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-start text-sm">
              <thead><tr className="border-b border-line text-muted-foreground">
                <th scope="col" className="px-2 py-2">{t("settings.diagnostics.columns.time")}</th>
                <th scope="col" className="px-2 py-2">{t("settings.diagnostics.columns.severity")}</th>
                <th scope="col" className="px-2 py-2">{t("settings.diagnostics.columns.type")}</th>
                <th scope="col" className="px-2 py-2">{t("settings.diagnostics.columns.code")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data?.events.length === 0 && <tr><td colSpan={4} className="px-2 py-3">{t("settings.diagnostics.empty")}</td></tr>}
                {(data?.events ?? []).map((event, index) => (
                  <tr key={`${event.occurredAt}-${index}`}>
                    <td className="px-2 py-3"><time dir="ltr" dateTime={event.occurredAt}>{event.occurredAt}</time></td>
                    <td className="px-2 py-3">{localizedValue("level", event.level)}</td>
                    <td className="px-2 py-3">{localizedValue("category", event.category)}</td>
                    <td className="px-2 py-3"><bdi dir="ltr" className="font-mono">{event.errorId === null ? "—" : formatErrorCode(event.errorId)}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button type="button" className="mt-4" disabled={saving} onClick={() => void saveBundle()}>
          {saving ? t("settings.diagnostics.saving") : t("settings.diagnostics.saveBundle")}
        </Button>
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </div>
    </section>
  );
}
