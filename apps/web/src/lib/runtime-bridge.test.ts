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
      serverLog: "",
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("get_runtime_config");
  });

  it("loads runtime config and log data through Tauri commands", async () => {
    const runtimeConfig: RuntimeConfig = {
      apiBaseUrl: "http://127.0.0.1:4318",
      appClientKey: "desktop-key",
      projectDir: "D:/Tuari/projects/default",
      authDbPath: "D:/Tuari/tuari.sqlite",
      appDbPath: "D:/Tuari/tuari.sqlite",
      serverLogPath: "D:/Tuari/logs/api-server.log",
    };

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_runtime_config") {
        return runtimeConfig;
      }

      if (command === "get_server_log") {
        return "ready\nlistening\n";
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:05:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:05:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: runtimeConfig,
      serverLog: "ready\nlistening",
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_runtime_config");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "get_server_log");
  });

  it("keeps desktop diagnostics connected when log loading fails", async () => {
    const runtimeConfig: RuntimeConfig = {
      apiBaseUrl: "http://127.0.0.1:4318",
      appClientKey: "desktop-key",
      projectDir: "D:/Tuari/projects/default",
      authDbPath: "D:/Tuari/tuari.sqlite",
      appDbPath: "D:/Tuari/tuari.sqlite",
      serverLogPath: "D:/Tuari/logs/api-server.log",
    };

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_runtime_config") {
        return runtimeConfig;
      }

      if (command === "get_server_log") {
        throw new Error("log file locked");
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const status = await getRuntimeStatus({ now: () => "2026-03-12T10:07:00.000Z" });

    expect(status).toEqual({
      checkedAt: "2026-03-12T10:07:00.000Z",
      environment: "desktop",
      endpoint: "http://127.0.0.1:4318",
      health: "connected",
      config: runtimeConfig,
      serverLog: "",
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
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
      serverLog: "",
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
      serverLog: "",
      error: "runtime config not found; sidecar not available",
    });
  });
});
