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

      const updated = [...presets, newPreset];
      setPresets(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return true;
    },
    [presets, storageKey, maxPresets]
  );

  const deletePreset = useCallback(
    (id: string) => {
      const updated = presets.filter((p) => p.id !== id);
      setPresets(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    },
    [presets, storageKey]
  );

  const updatePreset = useCallback(
    (id: string, updates: Partial<Omit<FilterPreset, "id">>) => {
      const updated = presets.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      setPresets(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    },
    [presets, storageKey]
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
