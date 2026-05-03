import { describe, it, expect, beforeEach } from "vitest";
import { useBatchSelection } from "@/hooks/use-batch-selection";
import { renderHook, act } from "@testing-library/react";

describe("Batch Selection Integration", () => {
  const mockItems = [
    { id: "1", name: "Item 1" },
    { id: "2", name: "Item 2" },
    { id: "3", name: "Item 3" },
    { id: "4", name: "Item 4" },
    { id: "5", name: "Item 5" },
  ];

  it("initializes with empty selection", () => {
    const { result } = renderHook(() => useBatchSelection(mockItems));

    expect(result.current.selectCount).toBe(0);
    expect(result.current.isAllSelected).toBe(false);
    expect(result.current.isPartiallySelected).toBe(false);
  });

  it("toggles individual items", () => {
    const { result } = renderHook(() => useBatchSelection(mockItems));

    act(() => {
      result.current.toggleItem("1");
    });

    expect(result.current.selectCount).toBe(1);
    expect(result.current.selectedIds.has("1")).toBe(true);

    act(() => {
      result.current.toggleItem("1");
    });

    expect(result.current.selectCount).toBe(0);
  });

  it("toggles all items", () => {
    const { result } = renderHook(() => useBatchSelection(mockItems));

    act(() => {
      result.current.toggleAll();
    });

    expect(result.current.isAllSelected).toBe(true);
    expect(result.current.selectCount).toBe(5);

    act(() => {
      result.current.toggleAll();
    });

    expect(result.current.isAllSelected).toBe(false);
    expect(result.current.selectCount).toBe(0);
  });

  it("detects partial selection", () => {
    const { result } = renderHook(() => useBatchSelection(mockItems));

    act(() => {
      result.current.toggleItem("1");
      result.current.toggleItem("2");
    });

    expect(result.current.isPartiallySelected).toBe(true);
    expect(result.current.isAllSelected).toBe(false);
  });

  it("enforces max batch size of 100", () => {
    const largeItems = Array.from({ length: 150 }, (_, i) => ({
      id: String(i + 1),
      name: `Item ${i + 1}`,
    }));

    const { result } = renderHook(() => useBatchSelection(largeItems));

    act(() => {
      result.current.toggleAll();
    });

    expect(result.current.selectCount).toBeLessThanOrEqual(100);
    expect(result.current.canSelectMore).toBe(false);
  });

  it("clears selection", () => {
    const { result } = renderHook(() => useBatchSelection(mockItems));

    act(() => {
      result.current.toggleAll();
    });

    expect(result.current.selectCount).toBe(5);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectCount).toBe(0);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("returns selected items", () => {
    const { result } = renderHook(() => useBatchSelection(mockItems));

    act(() => {
      result.current.toggleItem("1");
      result.current.toggleItem("3");
    });

    expect(result.current.selectedItems).toHaveLength(2);
    expect(result.current.selectedItems.map((i: any) => i.id)).toEqual(["1", "3"]);
  });
});
