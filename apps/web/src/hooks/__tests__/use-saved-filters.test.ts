import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSavedFilters } from "@/hooks/use-saved-filters";

describe("useSavedFilters — presets", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("saves and retrieves filter presets from localStorage", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters", maxPresets: 10 })
    );

    act(() => {
      result.current.savePreset("Paid Invoices", { status: "PAID" });
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]?.name).toBe("Paid Invoices");
  });

  it("enforces max presets limit", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters", maxPresets: 2 })
    );

    act(() => {
      result.current.savePreset("Filter 1", {});
      result.current.savePreset("Filter 2", {});
    });

    expect(result.current.presets).toHaveLength(2);

    act(() => {
      result.current.savePreset("Filter 3", {});
    });

    expect(result.current.presets).toHaveLength(2);
  });

  it("deletes presets by id", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.savePreset("Test", {});
    });

    expect(result.current.presets).toHaveLength(1);
    const presetId = result.current.presets[0]?.id ?? "";

    act(() => {
      result.current.deletePreset(presetId);
    });

    expect(result.current.presets).toHaveLength(0);
  });

  it("clears all presets", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.savePreset("Filter 1", {});
      result.current.savePreset("Filter 2", {});
    });

    expect(result.current.presets).toHaveLength(2);

    act(() => {
      result.current.clearAllPresets();
    });

    expect(result.current.presets).toHaveLength(0);
  });

  it("updates a preset by id, preserving its id", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.savePreset("Original", { status: "PAID" });
    });

    const presetId = result.current.presets[0]?.id ?? "";

    act(() => {
      result.current.updatePreset(presetId, { name: "Renamed" });
    });

    expect(result.current.presets[0]?.id).toBe(presetId);
    expect(result.current.presets[0]?.name).toBe("Renamed");
    expect(result.current.presets[0]?.filters).toEqual({ status: "PAID" });
  });

  it("updatePreset is a no-op for unknown ids", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.savePreset("Real", { status: "PAID" });
      result.current.updatePreset("does-not-exist", { name: "Phantom" });
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]?.name).toBe("Real");
  });
});

describe("useSavedFilters — filter history", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("starts with an empty history", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    expect(result.current.history).toEqual([]);
  });

  it("appends a new entry when addToHistory is called", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({ status: "PAID" });
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]?.filters).toEqual({ status: "PAID" });
    expect(typeof result.current.history[0]?.usedAt).toBe("number");
  });

  it("stores most-recent entries first", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({ status: "PAID" });
      result.current.addToHistory({ status: "UNPAID" });
    });

    expect(result.current.history[0]?.filters).toEqual({ status: "UNPAID" });
    expect(result.current.history[1]?.filters).toEqual({ status: "PAID" });
  });

  it("dedupes identical filter combinations and bumps them to the top", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({ status: "PAID" });
      result.current.addToHistory({ status: "UNPAID" });
      result.current.addToHistory({ status: "PAID" });
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0]?.filters).toEqual({ status: "PAID" });
    expect(result.current.history[1]?.filters).toEqual({ status: "UNPAID" });
  });

  it("trims oldest entries past maxHistory (default 10)", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      for (let i = 0; i < 12; i += 1) {
        result.current.addToHistory({ bucket: i });
      }
    });

    expect(result.current.history).toHaveLength(10);
    expect(result.current.history[0]?.filters).toEqual({ bucket: 11 });
    expect(result.current.history[9]?.filters).toEqual({ bucket: 2 });
  });

  it("respects a custom maxHistory option", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters", maxHistory: 3 })
    );

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        result.current.addToHistory({ bucket: i });
      }
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0]?.filters).toEqual({ bucket: 4 });
  });

  it("clears all history entries", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({ status: "PAID" });
      result.current.addToHistory({ status: "UNPAID" });
    });

    expect(result.current.history).toHaveLength(2);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
  });

  it("persists history across remounts via localStorage", () => {
    const first = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      first.result.current.addToHistory({ status: "PAID" });
    });

    expect(first.result.current.history).toHaveLength(1);

    first.unmount();

    const second = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    expect(second.result.current.history).toHaveLength(1);
    expect(second.result.current.history[0]?.filters).toEqual({ status: "PAID" });
  });

  it("ignores empty filter objects in history", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({});
    });

    expect(result.current.history).toEqual([]);
  });

  it("dedupes nested-object filters regardless of key order", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({ a: { x: 1, y: 2 }, b: [1, 2] });
      result.current.addToHistory({ b: [1, 2], a: { y: 2, x: 1 } });
    });

    expect(result.current.history).toHaveLength(1);
  });

  it("treats primitive non-empty values (0, false) as active filters", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.addToHistory({ count: 0, active: false });
    });

    expect(result.current.history).toHaveLength(1);
  });

  it("keeps presets and history independent", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    act(() => {
      result.current.savePreset("Paid", { status: "PAID" });
      result.current.addToHistory({ status: "UNPAID" });
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.history).toHaveLength(1);

    act(() => {
      result.current.clearAllPresets();
    });

    expect(result.current.presets).toEqual([]);
    expect(result.current.history).toHaveLength(1);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
  });
});
