/**
 * Hook for managing saved filter presets.
 */
import { useCallback, useEffect, useState } from "react";

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: number;
}

interface UseSavedFiltersOptions {
  storageKey: string;
  maxPresets?: number;
}

/**
 * useSavedFilters(options component.
 */
export function useSavedFilters(options: UseSavedFiltersOptions) {
  const { storageKey, maxPresets = 10 } = options;
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as FilterPreset[];
        setPresets(parsed);
      }
    } catch {
      console.warn(`Failed to load filter presets from ${storageKey}`);
    }
    setIsLoaded(true);
  }, [storageKey]);

  const savePreset = useCallback(
    (name: string, filters: Record<string, unknown>) => {
      if (presets.length >= maxPresets) {
        console.warn(`Max ${maxPresets} filter presets allowed`);
        return false;
      }

      const newPreset: FilterPreset = {
        id: `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        filters,
        createdAt: Date.now(),
      };

      setPresets(current => {
        if (current.length >= maxPresets) return current;
        const updated = [...current, newPreset];
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
      return true;
    },
    [presets, storageKey, maxPresets]
  );

  const deletePreset = useCallback(
    (id: string) => {
      setPresets(current => {
        const updated = current.filter((p) => p.id !== id);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
    },
    [storageKey]
  );

  const updatePreset = useCallback(
    (id: string, updates: Partial<Omit<FilterPreset, "id">>) => {
      setPresets(current => {
        const updated = current.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        );
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
    },
    [storageKey]
  );

  const clearAllPresets = useCallback(() => {
    setPresets([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    presets,
    isLoaded,
    savePreset,
    deletePreset,
    updatePreset,
    clearAllPresets,
  };
}
