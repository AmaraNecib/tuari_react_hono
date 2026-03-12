// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeStatus } from "@/lib/runtime-bridge";
import { useRuntimeStatusQuery } from "./use-runtime-status-query";

vi.mock("@/lib/runtime-bridge", () => ({
  getRuntimeStatus: vi.fn(),
}));

const getRuntimeStatusMock = vi.mocked(getRuntimeStatus);

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

  it("returns runtime diagnostics from the runtime bridge", async () => {
    getRuntimeStatusMock.mockResolvedValue({
      checkedAt: "2026-03-12T11:00:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: {
        apiBaseUrl: "http://127.0.0.1:4318",
        appClientKey: "desktop-key",
        projectDir: "D:/Tuari/projects/default",
        authDbPath: "D:/Tuari/tuari.sqlite",
        appDbPath: "D:/Tuari/tuari.sqlite",
        serverLogPath: "D:/Tuari/logs/api-server.log",
      },
      serverLog: "ready",
      error: null,
    });

    const { result } = renderHook(() => useRuntimeStatusQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.endpoint).toBe("http://127.0.0.1:4318");
    expect(result.current.data?.serverLog).toBe("ready");
    expect(result.current.data?.health).toBe("connected");
    expect(getRuntimeStatusMock).toHaveBeenCalledTimes(1);
  });
});
