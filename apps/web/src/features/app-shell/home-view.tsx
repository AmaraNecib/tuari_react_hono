import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Languages, MoonStar, Sparkles, SunMedium, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/features/preferences/preferences";
import { useRuntimeStatusQuery } from "@/features/runtime/use-runtime-status-query";

type Copy = {
  eyebrow: string;
  title: string;
  description: string;
  statusHoverConnected: string;
  statusHoverPreview: string;
  statusHoverDegraded: string;
  statusHoverLoading: string;
  statusPanelTitle: string;
  statusPanelDescription: string;
  themeButtonLabel: string;
  languageButtonLabel: string;
  languageSwitchValue: string;
  interfaceBehavior: string;
  themeNoteLabel: string;
  themeNote: string;
  cards: Array<{
    title: string;
    text: string;
    value: string;
  }>;
  diagnostics: {
    connection: string;
    environment: string;
    endpoint: string;
    issue: string;
    surface: string;
    layout: string;
    checkedAt: string;
    connected: string;
    preview: string;
    degraded: string;
    desktop: string;
    browser: string;
    loading: string;
    unavailable: string;
    loadingEndpoint: string;
    degradedEndpoint: string;
    dark: string;
    light: string;
    englishLayout: string;
    arabicLayout: string;
  };
};

const copy: Record<"en" | "ar", Copy> = {
  en: {
    eyebrow: "Local-first interface refresh",
    title: "Light stays familiar. Dark feels like its twin, not a different product.",
    description:
      "This Vite shell adds a cleaner top control area, a one-tap language switch, and a darker palette that keeps the same warm, quiet character as the light theme.",
    statusHoverConnected: "Connected to local runtime",
    statusHoverPreview: "Running in browser preview",
    statusHoverDegraded: "Desktop runtime needs attention",
    statusHoverLoading: "Checking runtime diagnostics",
    statusPanelTitle: "Runtime status",
    statusPanelDescription:
      "The top control stays compact as a dot, reveals its state on hover, and opens live runtime diagnostics on click.",
    themeButtonLabel: "Switch color theme",
    languageButtonLabel: "Switch language",
    languageSwitchValue: "AR",
    interfaceBehavior: "Interface behavior",
    themeNoteLabel: "Theme note",
    themeNote:
      "The dark palette stays close to the light one: soft contrast, warm surfaces, and clear controls instead of a cold black-only switch.",
    cards: [
      {
        title: "Theme pairing",
        text: "The dark mode uses the same soft neutrals and accent rhythm instead of switching to a generic black UI.",
        value: "Light + Dark",
      },
      {
        title: "Header control",
        text: "The connection badge is reduced to a dot by default and exposes more context only when needed.",
        value: "Hover + Click",
      },
      {
        title: "Language flow",
        text: "One button always shows the other language, so the action stays obvious without opening a menu.",
        value: "EN / AR",
      },
    ],
    diagnostics: {
      connection: "Connection",
      environment: "Environment",
      endpoint: "API endpoint",
      issue: "Runtime issue",
      surface: "Surface mode",
      layout: "Language layout",
      checkedAt: "Last check",
      connected: "Local runtime connected",
      preview: "Browser preview shell",
      degraded: "Desktop runtime unavailable",
      desktop: "Desktop / Tauri",
      browser: "Browser / Preview",
      loading: "Checking runtime diagnostics",
      unavailable: "Unavailable",
      loadingEndpoint: "Checking desktop bridge...",
      degradedEndpoint: "Desktop bridge unavailable",
      dark: "Dark theme active",
      light: "Light theme active",
      englishLayout: "English / LTR",
      arabicLayout: "Arabic / RTL",
    },
  },
  ar: {
    eyebrow: "تحديث الواجهة المحلية",
    title: "الوضع الفاتح يبقى مألوفًا، والوضع الداكن يصبح نسخته القريبة لا واجهة مختلفة.",
    description:
      "هذه واجهة Vite تضيف منطقة تحكم علوية أنظف، وزر لغة واحدًا، ولوحة داكنة تحافظ على نفس الشخصية الهادئة الموجودة في الوضع الفاتح.",
    statusHoverConnected: "متصل بالمحرك المحلي",
    statusHoverPreview: "يعمل في معاينة المتصفح",
    statusHoverDegraded: "محرك سطح المكتب يحتاج متابعة",
    statusHoverLoading: "جار فحص تفاصيل التشغيل",
    statusPanelTitle: "حالة التشغيل",
    statusPanelDescription:
      "عنصر الأعلى يبقى نقطة صغيرة، ويعرض الحالة عند المرور، ويفتح تفاصيل تشغيل حية عند الضغط.",
    themeButtonLabel: "تبديل المظهر",
    languageButtonLabel: "تبديل اللغة",
    languageSwitchValue: "EN",
    interfaceBehavior: "سلوك الواجهة",
    themeNoteLabel: "ملاحظة المظهر",
    themeNote:
      "لوحة الوضع الداكن تبقى قريبة من الفاتح: تباين هادئ، وأسقف دافئة، وتحكم واضح بدل التحول إلى سواد عام.",
    cards: [
      {
        title: "ازدواجية المظهر",
        text: "الوضع الداكن يحافظ على نفس الإيقاع اللوني والهدوء بدل أن يتحول إلى واجهة سوداء عامة.",
        value: "فاتح + داكن",
      },
      {
        title: "عنصر الرأس",
        text: "شارة الاتصال أصبحت نقطة صغيرة بشكل افتراضي وتكشف التفاصيل فقط عند الحاجة.",
        value: "مرور + ضغط",
      },
      {
        title: "تبديل اللغة",
        text: "زر واحد يعرض اللغة الأخرى مباشرة حتى تبقى العملية واضحة بدون قائمة إضافية.",
        value: "EN / AR",
      },
    ],
    diagnostics: {
      connection: "الاتصال",
      environment: "البيئة",
      endpoint: "واجهة API",
      issue: "مشكلة التشغيل",
      surface: "وضع العرض",
      layout: "اتجاه الواجهة",
      checkedAt: "آخر فحص",
      connected: "المحرك المحلي متصل",
      preview: "معاينة المتصفح",
      degraded: "محرك سطح المكتب غير متاح",
      desktop: "سطح المكتب / Tauri",
      browser: "المتصفح / المعاينة",
      loading: "جار فحص تفاصيل التشغيل",
      unavailable: "غير متاح",
      loadingEndpoint: "جار التحقق من جسر سطح المكتب...",
      degradedEndpoint: "جسر سطح المكتب غير متاح",
      dark: "الوضع الداكن فعال",
      light: "الوضع الفاتح فعال",
      englishLayout: "الإنجليزية / LTR",
      arabicLayout: "العربية / RTL",
    },
  },
};

function ThemeToggleButton({ label }: { label: string }) {
  const { theme, toggleTheme } = useAppPreferences();
  const isDark = theme === "dark";

  return (
    <Button
      aria-label={label}
      className="rounded-full border-white/60 bg-white/75 backdrop-blur-sm dark:border-white/10 dark:bg-white/8"
      onClick={toggleTheme}
      size="icon-sm"
      title={label}
      variant="outline"
    >
      {isDark ? <SunMedium /> : <MoonStar />}
    </Button>
  );
}

function LanguageToggleButton({ label, value }: { label: string; value: string }) {
  const { toggleLocale } = useAppPreferences();

  return (
    <Button
      aria-label={label}
      className="rounded-full border-white/60 bg-white/75 px-3.5 font-semibold tracking-[0.18em] backdrop-blur-sm dark:border-white/10 dark:bg-white/8"
      onClick={toggleLocale}
      title={label}
      variant="outline"
    >
      <Languages className="size-3.5" />
      {value}
    </Button>
  );
}

function ConnectionStatusButton({
  checkedAt,
  diagnostics,
  health,
  hoverLabel,
  locale,
  panelDescription,
  panelTitle,
}: {
  checkedAt: string;
  diagnostics: Array<{ label: string; value: string }>;
  health: "connected" | "preview" | "degraded" | "loading";
  hoverLabel: string;
  locale: "en" | "ar";
  panelDescription: string;
  panelTitle: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        aria-expanded={isOpen}
        aria-label={hoverLabel}
        className="group relative flex size-10 items-center justify-center rounded-full border border-white/60 bg-white/80 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-white/8 dark:shadow-[0_18px_48px_rgba(0,0,0,0.32)]"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="sr-only">{hoverLabel}</span>
          <span className="relative flex size-3.5 items-center justify-center">
            <span
              className={cn(
                "absolute inset-0 rounded-full blur-[4px]",
                health === "connected" && "bg-emerald-400/35",
                health === "preview" && "bg-slate-400/35",
                health === "degraded" && "bg-amber-400/40",
                health === "loading" && "bg-sky-400/35",
              )}
            />
            <span
              className={cn(
                "relative size-2.5 rounded-full ring-4 transition group-hover:scale-110",
                health === "connected" && "bg-emerald-500 ring-emerald-500/15",
                health === "preview" && "bg-slate-500 ring-slate-500/15",
                health === "degraded" && "bg-amber-500 ring-amber-500/20",
                health === "loading" && "bg-sky-500 ring-sky-500/20",
              )}
            />
          </span>
          <span className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 translate-y-1 rounded-full border border-white/70 bg-white/92 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-slate-700 opacity-0 shadow-lg backdrop-blur-sm transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 dark:border-white/10 dark:bg-slate-950/92 dark:text-slate-100">
            {hoverLabel}
          </span>
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute top-14 z-20 w-80 rounded-[26px] border border-white/70 bg-white/92 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
            locale === "ar" ? "left-0" : "right-0",
          )}
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{panelTitle}</p>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {panelDescription}
            </p>
            <p className="pt-1 text-xs font-medium tracking-[0.16em] text-slate-400 uppercase">
              {checkedAt}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {diagnostics.map((item) => (
              <div
                className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 dark:border-white/8 dark:bg-white/5"
                key={item.label}
              >
                <span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className="max-w-[58%] break-words text-right text-sm leading-6 font-medium text-slate-900 dark:text-slate-100">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HomeView() {
  const { locale, theme } = useAppPreferences();
  const { data, isPending } = useRuntimeStatusQuery();
  const content = copy[locale];
  const runtimeState = isPending || !data ? "loading" : data.health;
  const hoverLabel =
    runtimeState === "connected"
      ? content.statusHoverConnected
      : runtimeState === "degraded"
        ? content.statusHoverDegraded
        : runtimeState === "preview"
          ? content.statusHoverPreview
          : content.statusHoverLoading;
  const checkedAt = data?.checkedAt
    ? new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(data.checkedAt))
    : "--";
  const connectionLabel =
    runtimeState === "connected"
      ? content.diagnostics.connected
      : runtimeState === "degraded"
        ? content.diagnostics.degraded
        : runtimeState === "preview"
          ? content.diagnostics.preview
          : content.diagnostics.loading;
  const environmentLabel =
    runtimeState === "loading"
      ? content.diagnostics.loading
      : data?.environment === "desktop"
        ? content.diagnostics.desktop
        : content.diagnostics.browser;
  const endpointLabel =
    runtimeState === "loading"
      ? content.diagnostics.loadingEndpoint
      : runtimeState === "degraded"
        ? data?.endpoint ?? content.diagnostics.degradedEndpoint
        : data?.endpoint ?? content.diagnostics.unavailable;

  const diagnostics = [
    {
      label: content.diagnostics.connection,
      value: connectionLabel,
    },
    {
      label: content.diagnostics.environment,
      value: environmentLabel,
    },
    {
      label: content.diagnostics.endpoint,
      value: endpointLabel,
    },
    {
      label: content.diagnostics.surface,
      value: theme === "dark" ? content.diagnostics.dark : content.diagnostics.light,
    },
    {
      label: content.diagnostics.layout,
      value: locale === "ar" ? content.diagnostics.arabicLayout : content.diagnostics.englishLayout,
    },
    {
      label: content.diagnostics.checkedAt,
      value: checkedAt,
    },
    ...(data?.error
      ? [
          {
            label: content.diagnostics.issue,
            value: data.error,
          },
        ]
      : []),
  ];

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-10">
      <div className="app-shell mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col rounded-[32px] border border-white/60 bg-white/68 p-5 shadow-[0_30px_100px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55 dark:shadow-[0_36px_120px_rgba(0,0,0,0.48)] sm:p-7 lg:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-200/70 pb-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-slate-600 uppercase dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
              <Sparkles className="size-3.5" />
              {content.eyebrow}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <Waves className="size-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-[0.08em] text-slate-950 uppercase dark:text-slate-50">
                  Tuari
                </p>
                <p className="max-w-[18rem] break-words text-sm text-slate-500 dark:text-slate-400">
                  {endpointLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <ThemeToggleButton label={content.themeButtonLabel} />
            <LanguageToggleButton
              label={content.languageButtonLabel}
              value={content.languageSwitchValue}
            />
            <ConnectionStatusButton
              checkedAt={checkedAt}
              diagnostics={diagnostics}
              health={runtimeState}
              hoverLabel={hoverLabel}
              locale={locale}
              panelDescription={content.statusPanelDescription}
              panelTitle={content.statusPanelTitle}
            />
          </div>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
          <div className="space-y-7">
            <div className="space-y-4">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] text-slate-950 sm:text-5xl lg:text-6xl dark:text-slate-50">
                {content.title}
              </h1>
              <p className="max-w-2xl text-balance text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
                {content.description}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {content.cards.map((card) => (
                <article
                  className="rounded-[28px] border border-white/70 bg-white/76 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:shadow-[0_18px_44px_rgba(0,0,0,0.22)]"
                  key={card.title}
                >
                  <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                    {card.value}
                  </p>
                  <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-slate-100">
                    {card.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {card.text}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(233,239,246,0.9))] p-6 shadow-[0_28px_70px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(11,17,32,0.96),rgba(18,28,48,0.88))] dark:shadow-[0_28px_70px_rgba(0,0,0,0.36)]">
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                    {content.interfaceBehavior}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                    {content.statusPanelTitle}
                  </p>
                </div>
                <div className="rounded-full border border-sky-400/20 bg-sky-500/10 p-3 text-sky-700 dark:text-sky-300">
                  <ArrowUpRight className="size-5" />
                </div>
              </div>

              <div className="space-y-3">
                {diagnostics.map((item) => (
                  <div
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 dark:border-white/8 dark:bg-white/5"
                    key={item.label}
                  >
                    <span className="min-w-0 text-sm text-slate-500 dark:text-slate-400">{item.label}</span>
                    <span className="max-w-[60%] break-words text-right text-sm leading-6 font-medium text-slate-900 dark:text-slate-100">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-5 text-slate-50 dark:border-white/10 dark:bg-white dark:text-slate-950">
                <p className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-300 dark:text-slate-500">
                  {content.themeNoteLabel}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-200 dark:text-slate-700">
                  {content.themeNote}
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
