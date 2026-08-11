import { describe, expect, it, vi } from "vitest";

import { createShutdownHandler, installShutdownHook } from "./shutdown";

describe("createShutdownHandler", () => {
  it("stops the server, closes the connection, then exits", async () => {
    const stopServer = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    const log = vi.fn();

    const handler = createShutdownHandler({ stopServer, close }, { log, exit });

    await expect(handler()).rejects.toThrow("exit");

    // Order matters: stop accepting requests first, then close the DB
    // (the connection flush happens on close).
    expect(stopServer).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(stopServer.mock.invocationCallOrder[0]!).toBeLessThan(close.mock.invocationCallOrder[0]!);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("is idempotent — a second signal while shutting down is ignored", async () => {
    const stopServer = vi.fn();
    const close = vi.fn();
    const exit = vi.fn(() => {
      throw new Error("exit");
    });

    const handler = createShutdownHandler({ stopServer, close }, { exit });

    await expect(handler()).rejects.toThrow("exit");
    // A second signal while shutting down is a no-op — it must not re-run
    // shutdown steps or attempt a second exit.
    await expect(handler()).resolves.toBeUndefined();

    expect(stopServer).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("logs and proceeds when stopping the server fails", async () => {
    const stopServer = vi.fn().mockRejectedValue(new Error("server busy"));
    const close = vi.fn();
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    const log = vi.fn();

    const handler = createShutdownHandler({ stopServer, close }, { log, exit });

    await expect(handler()).rejects.toThrow("exit");

    expect(log).toHaveBeenCalledWith(expect.stringContaining("server busy"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("logs and proceeds when closing the connection fails", async () => {
    const stopServer = vi.fn();
    const close = vi.fn(() => {
      throw new Error("db busy");
    });
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    const log = vi.fn();

    const handler = createShutdownHandler({ stopServer, close }, { log, exit });

    await expect(handler()).rejects.toThrow("exit");

    expect(log).toHaveBeenCalledWith(expect.stringContaining("db busy"));
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("installShutdownHook", () => {
  it("registers a listener per signal and removes them on cleanup", () => {
    // SIGUSR2 is never emitted by the harness — registering a listener is safe.
    const targets = { stopServer: vi.fn(), close: vi.fn() };
    const before = process.listenerCount("SIGUSR2");

    const cleanup = installShutdownHook(targets, { signals: ["SIGUSR2"], exit: vi.fn() as never });
    expect(process.listenerCount("SIGUSR2")).toBe(before + 1);

    cleanup();
    expect(process.listenerCount("SIGUSR2")).toBe(before);
  });
});
