// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider } from "@/features/preferences/preferences";
import { useRuntimeStatusQuery } from "@/features/runtime/use-runtime-status-query";
import { HomeView } from "./home-view";

vi.mock("@/features/runtime/use-runtime-status-query", () => ({
  useRuntimeStatusQuery: vi.fn(),
}));

const useRuntimeStatusQueryMock = vi.mocked(useRuntimeStatusQuery);

function renderHomeView() {
  return render(
    <AppPreferencesProvider>
      <HomeView />
    </AppPreferencesProvider>,
  );
}

describe("HomeView runtime diagnostics", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.locale = "en";
    window.localStorage.clear();
    useRuntimeStatusQueryMock.mockReset();
  });

  it("shows a neutral loading state before runtime diagnostics resolve", () => {
    useRuntimeStatusQueryMock.mockReturnValue({
      data: undefined,
      isPending: true,
    } as ReturnType<typeof useRuntimeStatusQuery>);

    renderHomeView();

    expect(screen.getAllByText("Checking desktop bridge...").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Checking runtime diagnostics").length).toBeGreaterThan(0);
    expect(screen.queryByText("Browser preview shell")).toBeNull();
    expect(screen.queryByText("Local runtime connected")).toBeNull();
  });

  it("does not use preview fallbacks when the desktop runtime is degraded", () => {
    useRuntimeStatusQueryMock.mockReturnValue({
      data: {
        checkedAt: "2026-03-12T12:00:00.000Z",
        environment: "desktop",
        endpoint: "Tauri sidecar bridge",
        health: "degraded",
        config: null,
        error: "bridge offline",
      },
      isPending: false,
    } as ReturnType<typeof useRuntimeStatusQuery>);

    renderHomeView();

    expect(screen.queryByText("Unavailable while desktop bridge is degraded")).toBeNull();
    expect(screen.getByText("bridge offline")).toBeTruthy();
    expect(screen.getAllByText("Tauri sidecar bridge").length).toBeGreaterThan(0);
  });
});
