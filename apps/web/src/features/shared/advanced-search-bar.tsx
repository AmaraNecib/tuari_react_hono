import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type FilterPreset, useSavedFilters } from "@/hooks/use-saved-filters";

interface AdvancedSearchBarProps {
  onSearch: (query: string, filters: Record<string, unknown>) => void;
  storageKey: string;
  debounceMs?: number;
}

export function AdvancedSearchBar({
  onSearch,
  storageKey,
  debounceMs = 300,
}: AdvancedSearchBarProps) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});
  const [showPresets, setShowPresets] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");

  const { presets, savePreset, deletePreset } = useSavedFilters({
    storageKey,
  });

  const handleSearch = useCallback(
    (searchQuery: string, filters: Record<string, unknown>) => {
      onSearch(searchQuery, filters);
    },
    [onSearch]
  );

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(query, activeFilters);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, activeFilters, debounceMs, handleSearch]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
    },
    []
  );

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    savePreset(presetName, activeFilters);
    setPresetName("");
    setShowSaveDialog(false);
  }, [presetName, activeFilters, savePreset]);

  const handleLoadPreset = useCallback(
    (preset: FilterPreset) => {
      setActiveFilters(preset.filters);
      handleSearch(query, preset.filters);
      setShowPresets(false);
    },
    [query, handleSearch]
  );

  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="flex flex-col gap-2 md:flex-row">
        <Input
          placeholder="بحث..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="flex-1"
        />
        {presets.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPresets(!showPresets)}
          >
            فلاتر محفوظة ({presets.length})
          </Button>
        )}
        {hasActiveFilters && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSaveDialog(true);
              }}
            >
              حفظ البحث الحالي
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveFilters({});
                setQuery("");
                handleSearch("", {});
              }}
            >
              مسح
            </Button>
          </>
        )}
      </div>

      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <div className="flex gap-2 rounded-lg border border-border/60 bg-surface p-3">
          <Input
            placeholder="اسم البحث المحفوظ..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSavePreset();
              if (e.key === "Escape") setShowSaveDialog(false);
            }}
            className="flex-1 text-sm"
          />
          <Button size="sm" onClick={handleSavePreset}>
            حفظ
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowSaveDialog(false);
              setPresetName("");
            }}
          >
            إلغاء
          </Button>
        </div>
      )}

      {/* Saved Presets */}
      {showPresets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border/60 bg-surface p-3">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
            >
              <button
                onClick={() => handleLoadPreset(preset)}
                className="font-medium hover:underline"
              >
                {preset.name}
              </button>
              <button
                onClick={() => deletePreset(preset.id)}
                className="ml-1 hover:text-destructive"
                title="حذف"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
