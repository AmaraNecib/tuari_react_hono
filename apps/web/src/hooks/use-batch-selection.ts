/**
 * Hook for managing batch selection of items.
 */
import { useCallback, useState } from "react";

const MAX_BATCH_SIZE = 100;

/**
 * useBatchSelection<T extends component.
 */
export function useBatchSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected = selectedIds.size > 0 && !isAllSelected;
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const canSelectMore = selectedIds.size < MAX_BATCH_SIZE;

  const toggleItem = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (canSelectMore) {
            next.add(id);
          }
        }
        return next;
      });
    },
    [canSelectMore]
  );

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const toSelect = items.slice(0, MAX_BATCH_SIZE);
      setSelectedIds(new Set(toSelect.map((item) => item.id)));
    }
  }, [isAllSelected, items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids.slice(0, MAX_BATCH_SIZE)));
  }, []);

  return {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    selectCount: selectedIds.size,
    canSelectMore,
    toggleItem,
    toggleAll,
    clearSelection,
    setSelection,
  };
}
