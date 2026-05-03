import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { renderHook, act } from "@testing-library/react";

describe("Advanced Search & Filtering Integration", () => {
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
    expect(result.current.presets[0].name).toBe("Paid Invoices");
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
      const saved = result.current.savePreset("Filter 3", {});
      expect(saved).toBe(false);
    });

    expect(result.current.presets).toHaveLength(2);
  });

  it("deletes presets by id", () => {
    const { result } = renderHook(() =>
      useSavedFilters({ storageKey: "test-filters" })
    );

    let presetId = "";
    act(() => {
      result.current.savePreset("Test", {});
      presetId = result.current.presets[0].id;
    });

    expect(result.current.presets).toHaveLength(1);

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
});
