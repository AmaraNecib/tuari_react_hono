// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getRuntimeStatus, type RuntimeConfig } from "./runtime-bridge";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("runtime bridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to browser preview when the runtime bridge is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("window.__TAURI_INTERNALS__ is not available"));

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:00:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:00:00.000Z",
      environment: "browser",
      endpoint: "Browser preview shell",
      health: "preview",
      config: null,
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("get_runtime_config");
  });

  it("loads runtime config through the Tauri bridge", async () => {
    const runtimeConfig: RuntimeConfig = {
      apiBaseUrl: "http://127.0.0.1:4318",
    };

    invokeMock.mockResolvedValue(runtimeConfig);

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:05:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:05:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: runtimeConfig,
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_runtime_config");
  });

  it("does not request raw desktop diagnostics", async () => {
    const runtimeConfig: RuntimeConfig = {
      apiBaseUrl: "http://127.0.0.1:4318",
    };

    invokeMock.mockResolvedValue(runtimeConfig);

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:07:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:07:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: runtimeConfig,
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("reports a degraded desktop runtime when commands fail", async () => {
    invokeMock.mockRejectedValue(new Error("bridge offline"));

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:10:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:10:00.000Z",
      environment: "desktop",
      endpoint: "Tauri sidecar bridge",
      health: "degraded",
      config: null,
      error: "bridge offline",
    });
  });

  it("does not misclassify ambiguous desktop errors as browser preview", async () => {
    invokeMock.mockRejectedValue(new Error("runtime config not found; sidecar not available"));

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:12:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:12:00.000Z",
      environment: "desktop",
      endpoint: "Tauri sidecar bridge",
      health: "degraded",
      config: null,
      error: "runtime config not found; sidecar not available",
    });
  });
});
