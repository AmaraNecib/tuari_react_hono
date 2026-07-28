/**
 * Hook for managing saved filter presets and recent filter history.
 *
 * Both live in the same `localStorage` slot under a `{presets, history}` envelope
 * so writes are atomic and a single hook owns the lifecycle.
 */
import { useCallback, useEffect, useState } from "react";

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: number;
}

export interface FilterHistoryEntry {
  filters: Record<string, unknown>;
  usedAt: number;
}

export interface UseSavedFiltersOptions {
  storageKey: string;
  maxPresets?: number;
  maxHistory?: number;
}

interface PersistedState {
  presets: FilterPreset[];
  history: FilterHistoryEntry[];
}

function isHistoryEntry(value: unknown): value is FilterHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.usedAt === "number" &&
    typeof candidate.filters === "object" &&
    candidate.filters !== null
  );
}

function isPresetArray(value: unknown): value is FilterPreset[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.filters === "object" &&
      candidate.filters !== null
    );
  });
}

/** Deep-stable canonical JSON. Object keys are sorted at every level so two
 * structurally-equal filter maps always serialize the same way.
 *
 * Exported so consumers (e.g. AdvancedSearchBar) can do structural filter
 * comparison without re-implementing the algorithm. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
  );
  return (
    "{" +
    entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",") +
    "}"
  );
}

/**
 * A filter is "active" if it has any key whose value is non-empty:
 *  - non-empty string
 *  - non-null/undefined primitive (including 0 and false)
 *  - array with at least one entry
 *  - object with at least one key
 *
 * Note: `{active: false}` and `{count: 0}` ARE treated as active filters
 * because the user explicitly set them. Only `{}` and all-null entries are
 * skipped, because they are no-ops that would just pollute the history.
 */
function hasAnyFilter(filters: Record<string, unknown>): boolean {
  return Object.values(filters).some((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return true;
  });
}

const EMPTY_STATE: PersistedState = { presets: [], history: [] };

function loadState(stored: string | null): PersistedState {
  if (!stored) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(stored);
    if (isPresetArray(parsed)) {
      // Backwards-compat: older installs stored a bare FilterPreset[].
      return { presets: parsed, history: [] };
    }
    if (typeof parsed === "object" && parsed !== null) {
      const presets = isPresetArray(parsed.presets) ? parsed.presets : [];
      const history = Array.isArray(parsed.history)
        ? parsed.history.filter(isHistoryEntry)
        : [];
      return { presets, history };
    }
  } catch {
    // fall through to empty
  }
  return EMPTY_STATE;
}

/**
 * useSavedFilters(options) — preset + history store backed by localStorage.
 *
 * @description Hook
 */
export function useSavedFilters(options: UseSavedFiltersOptions) {
  const { storageKey, maxPresets = 10, maxHistory = 10 } = options;
  // Lazy initial state so the bar's `presets.length > 0` button doesn't
  // flash from empty → populated on first render. Guarded for SSR.
  const [state, setState] = useState<PersistedState>(() => {
    if (typeof window === "undefined") return EMPTY_STATE;
    return loadState(localStorage.getItem(storageKey));
  });

  // Persistence is a side effect, so it runs OUTSIDE the setState updater.
  // (React 18 StrictMode double-invokes updaters; we don't want localStorage
  // writes to fire twice and we don't want to violate the "pure updater"
  // contract.)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      console.warn(`Failed to persist filter state to ${storageKey}`);
    }
  }, [storageKey, state]);

  const savePreset = useCallback(
    (name: string, filters: Record<string, unknown>) => {
      const newPreset: FilterPreset = {
        id: `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        filters,
        createdAt: Date.now(),
      };

      setState((current) => {
        if (current.presets.length >= maxPresets) {
          console.warn(`Max ${maxPresets} filter presets allowed`);
          return current;
        }
        return {
          presets: [...current.presets, newPreset],
          history: current.history,
        };
      });
    },
    [maxPresets]
  );

  const deletePreset = useCallback((id: string) => {
    setState((current) => ({
      presets: current.presets.filter((p) => p.id !== id),
      history: current.history,
    }));
  }, []);

  const updatePreset = useCallback(
    (id: string, updates: Partial<Omit<FilterPreset, "id">>) => {
      setState((current) => ({
        presets: current.presets.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
        history: current.history,
      }));
    },
    []
  );

  const clearAllPresets = useCallback(() => {
    setState((current) => ({ presets: [], history: current.history }));
  }, []);

  const addToHistory = useCallback(
    (filters: Record<string, unknown>) => {
      if (!hasAnyFilter(filters)) return;
      const signature = canonicalJson(filters);
      setState((current) => {
        const filtered = current.history.filter(
          (entry) => canonicalJson(entry.filters) !== signature
        );
        const entry: FilterHistoryEntry = { filters, usedAt: Date.now() };
        return {
          presets: current.presets,
          history: [entry, ...filtered].slice(0, maxHistory),
        };
      });
    },
    [maxHistory]
  );

  const clearHistory = useCallback(() => {
    setState((current) => ({ presets: current.presets, history: [] }));
  }, []);

  return {
    presets: state.presets,
    history: state.history,
    savePreset,
    deletePreset,
    updatePreset,
    clearAllPresets,
    addToHistory,
    clearHistory,
  };
}
