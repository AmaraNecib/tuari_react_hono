import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  canonicalJson,
  type FilterPreset,
  useSavedFilters,
} from "@/hooks/use-saved-filters";

export interface QuickFilter {
  id: string;
  label: string;
  filters: Record<string, unknown>;
}

export interface AdvancedSearchBarProps {
  onSearch: (query: string, filters: Record<string, unknown>) => void;
  storageKey: string;
  debounceMs?: number;
  /** Predefined one-click filter combinations shown as chips. */
  quickFilters?: QuickFilter[];
  /** Initial filter set (e.g. when restoring from a query string). */
  initialFilters?: Record<string, unknown>;
  /** Force the mobile drawer layout even on wide viewports (testing only). */
  forceMobileLayout?: boolean;
}

function filtersMatch(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * useFocusTrap — confines Tab / Shift+Tab to the focusable elements inside
 * the given container ref while it is active. Required for ARIA
 * `role="dialog"` + `aria-modal="true"` patterns.
 */
function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((el) => !el.hasAttribute("aria-hidden"));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [containerRef, active]);
}

function filterLabel(
  filters: Record<string, unknown>,
  t: (key: string, fallback: string, options?: Record<string, unknown>) => string
): string {
  const keys = Object.keys(filters)
    .map((key) => `${key}: ${String(filters[key])}`)
    .join(", ");
  return t("search.historyEntryLabel", "{{keys}}", { keys: keys || "—" });
}

/**
 * useMediaQuery — returns true when the viewport is at or below the md
 * breakpoint (Tailwind's `md`, 768px). The initial client-side match avoids a
 * desktop-layout flash on narrow devices; the effect keeps it in sync.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Search bar with debounced multi-field search, quick filter chips, saved
 * presets, recent filter history, and a mobile-friendly drawer.
 *
 * @description Component
 */
export function AdvancedSearchBar({
  onSearch,
  storageKey,
  debounceMs = 300,
  quickFilters,
  initialFilters,
  forceMobileLayout = false,
}: AdvancedSearchBarProps) {
  // Auto-detect the md breakpoint so the mobile drawer opens automatically
  // on narrow viewports. `forceMobileLayout` overrides for tests.
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const useMobileLayout = forceMobileLayout || isNarrow;

  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>(
    initialFilters ?? {}
  );
  const [showPresets, setShowPresets] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    presets,
    history,
    savePreset,
    deletePreset,
    addToHistory,
    clearHistory,
  } = useSavedFilters({ storageKey });

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const lastHistorySignatureRef = useRef<string | null>(null);

  const hasActiveFilters =
    Object.keys(activeFilters).length > 0 || query.length > 0;

  // Debounce the search emit and record stable filter sets in history.
  // The history signature guard prevents flooding: a chip toggle that flips
  // the filter set, then back, writes at most one entry per distinct set.
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchRef.current(query, activeFilters);
      const filterKeys = Object.keys(activeFilters);
      if (filterKeys.length === 0) {
        lastHistorySignatureRef.current = null;
        return;
      }
      const signature = canonicalJson(activeFilters);
      if (signature !== lastHistorySignatureRef.current) {
        lastHistorySignatureRef.current = signature;
        addToHistory(activeFilters);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, activeFilters, debounceMs, addToHistory]);

  // Drawer keyboard handling and scroll lock. Always called; only takes
  // effect when the drawer is open in the mobile layout.
  useEffect(() => {
    if (!useMobileLayout || !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [useMobileLayout, drawerOpen]);

  const handleApplyFilters = useCallback(
    (next: Record<string, unknown>) => {
      setActiveFilters(next);
      setShowHistory(false);
    },
    []
  );

  const handleQuickFilter = useCallback(
    (qf: QuickFilter) => {
      const next = filtersMatch(activeFilters, qf.filters) ? {} : qf.filters;
      handleApplyFilters(next);
    },
    [activeFilters, handleApplyFilters]
  );

  const handleSavePreset = useCallback(() => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    savePreset(trimmed, activeFilters);
    setPresetName("");
    setShowSaveDialog(false);
  }, [presetName, activeFilters, savePreset]);

  const handleLoadPreset = useCallback(
    (preset: FilterPreset) => {
      handleApplyFilters(preset.filters);
    },
    [handleApplyFilters]
  );

  const handleClearAll = useCallback(() => {
    setActiveFilters({});
    setQuery("");
    setShowPresets(false);
    setShowHistory(false);
  }, []);

  const recentHistory = useMemo(() => history.slice(0, 5), [history]);

  const chipsRow =
    quickFilters && quickFilters.length > 0 ? (
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t("search.quickFilters")}
      >
        {quickFilters.map((qf) => {
          const isActive = filtersMatch(activeFilters, qf.filters);
          return (
            <Button
              key={qf.id}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              aria-pressed={isActive}
              onClick={() => handleQuickFilter(qf)}
            >
              {qf.label}
            </Button>
          );
        })}
      </div>
    ) : null;

  const presetPanel =
    showPresets && presets.length > 0 ? (
      <div className="flex flex-wrap gap-2 rounded-lg border border-border/60 bg-surface p-3">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
          >
            <button
              type="button"
              onClick={() => handleLoadPreset(preset)}
              className="font-medium hover:underline"
            >
              {preset.name}
            </button>
            <button
              type="button"
              onClick={() => deletePreset(preset.id)}
              className="ml-1 hover:text-destructive"
              aria-label={t("search.deletePreset")}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    ) : null;

  const historyPanel = showHistory ? (
    <div
      className="rounded-lg border border-border/60 bg-surface p-3"
      data-testid="history-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {t("search.recentFilters")}
        </span>
        {history.length > 0 ? (
          <Button size="xs" variant="ghost" onClick={clearHistory}>
            {t("search.clear")}
          </Button>
        ) : null}
      </div>
      {recentHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("search.noResults")}
        </p>
      ) : (
        <ul
          aria-label={t("search.recentFilters")}
          className="grid gap-1"
        >
          {recentHistory.map((entry, index) => (
            <li key={`${entry.usedAt}-${index}`}>
              <button
                type="button"
                className="w-full rounded-md px-3 py-1.5 text-start text-sm hover:bg-muted"
                onClick={() => handleApplyFilters(entry.filters)}
              >
                {filterLabel(entry.filters, t)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

  const saveDialogRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(saveDialogRef, showSaveDialog);
  useFocusTrap(drawerRef, drawerOpen);

  const saveDialog = showSaveDialog ? (
    <div
      ref={saveDialogRef}
      role="dialog"
      aria-label={t("search.saveCurrent")}
      className="flex gap-2 rounded-lg border border-border/60 bg-surface p-3"
    >
      <Input
        placeholder={t("search.presetNamePlaceholder")}
        value={presetName}
        onChange={(e) => setPresetName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSavePreset();
          if (e.key === "Escape") setShowSaveDialog(false);
        }}
        className="flex-1 text-sm"
        autoFocus
      />
      <Button size="sm" type="button" onClick={handleSavePreset}>
        {t("common.save")}
      </Button>
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => {
          setShowSaveDialog(false);
          setPresetName("");
        }}
      >
        {t("common.cancel")}
      </Button>
    </div>
  ) : null;

  const searchRow = (
    <div className="flex flex-col gap-2 md:flex-row">
      <Input
        placeholder={t("search.placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="flex-1"
        aria-label={t("search.placeholder")}
      />
      {presets.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showPresets}
          onClick={() => {
            setShowPresets((v) => !v);
            setShowHistory(false);
          }}
        >
          {t("search.savedPresetsWithCount", "Saved filters ({{count}})", {
            count: presets.length,
          })}
        </Button>
      ) : null}
      {history.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showHistory}
          onClick={() => {
            setShowHistory((v) => !v);
            setShowPresets(false);
          }}
        >
          {t("search.recent")}
        </Button>
      ) : null}
      {Object.keys(activeFilters).length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowSaveDialog(true)}
        >
          {t("search.saveCurrent")}
        </Button>
      ) : null}
      {hasActiveFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={handleClearAll}>
          {t("search.clear")}
        </Button>
      ) : null}
    </div>
  );

  const body = (
    <div className="space-y-3">
      {searchRow}
      {chipsRow}
      {saveDialog}
      {presetPanel}
      {historyPanel}
    </div>
  );

  if (useMobileLayout) {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
        >
          {t("search.openFilters")}
        </Button>
        {drawerOpen ? (
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("search.openFilters")}
            className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4"
          >
            <div className="ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("search.closeFilters")}
                autoFocus
              >
                {t("search.closeFilters")} ✕
              </Button>
            </div>
            <div className="mt-4 flex-1 overflow-auto">{body}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return body;
}
