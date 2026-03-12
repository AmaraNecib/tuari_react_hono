// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeStatus } from "@/lib/runtime-bridge";
import { useRuntimeStatusQuery } from "./use-runtime-status-query";

vi.mock("@/lib/runtime-bridge", () => ({
  getRuntimeStatus: vi.fn(),
}));

const getRuntimeStatusMock = vi.mocked(getRuntimeStatus);

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useRuntimeStatusQuery", () => {
  beforeEach(() => {
    getRuntimeStatusMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns runtime diagnostics from the runtime bridge", async () => {
    getRuntimeStatusMock.mockResolvedValue({
      checkedAt: "2026-03-12T11:00:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: {
        apiBaseUrl: "http://127.0.0.1:4318",
      },
      error: null,
    });

    const { result } = renderHook(() => useRuntimeStatusQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.endpoint).toBe("http://127.0.0.1:4318");
    expect(result.current.data?.health).toBe("connected");
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(1);
  });

  it("polls desktop diagnostics once per minute", async () => {
    vi.useFakeTimers();
    getRuntimeStatusMock.mockResolvedValue({
      checkedAt: "2026-03-12T11:05:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: null,
      error: null,
    });

    renderHook(() => useRuntimeStatusQuery(), {
      wrapper: createWrapper(),
    });

    await flushPromises();
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling when the app is running in browser preview", async () => {
    vi.useFakeTimers();
    getRuntimeStatusMock.mockResolvedValue({
      checkedAt: "2026-03-12T11:10:00.000Z",
      environment: "browser",
      endpoint: "Browser preview shell",
      health: "preview",
      config: null,
      error: null,
    });

    renderHook(() => useRuntimeStatusQuery(), {
      wrapper: createWrapper(),
    });

    await flushPromises();
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(1);
  });
});
