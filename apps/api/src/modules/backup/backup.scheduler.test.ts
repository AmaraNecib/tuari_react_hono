import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStartupBackup } from "./backup.scheduler";
import type { BackupService } from "./backup.types";

type StartupService = Pick<BackupService, "runDueBackup">;

const resolveNotDue = () => Promise.resolve({ status: "not-due" as const });

describe("createStartupBackup", () => {
  it("never runs the snapshot synchronously with the default scheduler", async () => {
    const runDueBackup = vi.fn(resolveNotDue);
    const startup = createStartupBackup({ runDueBackup });

    startup.onHealthServed();

    // The whole point: the (synchronous) snapshot is deferred off the turn that
    // answered the readiness probe.
    expect(runDueBackup).not.toHaveBeenCalled();
    expect(startup.hasScheduled()).toBe(true);
    await vi.waitFor(() => expect(runDueBackup).toHaveBeenCalledTimes(1));
  });

  it("runs once when health is served repeatedly and the fallback also fires", () => {
    const runDueBackup = vi.fn(resolveNotDue);
    let fallback: (() => void) | undefined;
    const startup = createStartupBackup(
      { runDueBackup },
      {
        schedule: (run) => run(),
        setTimer: (run) => {
          fallback = run;
          return {};
        },
      },
    );

    startup.onHealthServed();
    startup.onHealthServed();
    fallback?.();

    expect(runDueBackup).toHaveBeenCalledTimes(1);
  });

  it("arms the fallback so an unprobed install still backs up", () => {
    const runDueBackup = vi.fn(resolveNotDue);
    let fallback: (() => void) | undefined;
    const setTimer = vi.fn((run: () => void) => {
      fallback = run;
      return {};
    });
    const startup = createStartupBackup(
      { runDueBackup },
      { schedule: (run) => run(), setTimer, fallbackDelayMs: 1234 },
    );

    startup.onServerListening();

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 1234);
    expect(runDueBackup).not.toHaveBeenCalled();
    fallback?.();
    expect(runDueBackup).toHaveBeenCalledTimes(1);
  });

  it("defaults the fallback delay to 30s", () => {
    const setTimer = vi.fn(() => ({}));
    const startup = createStartupBackup(
      { runDueBackup: vi.fn(resolveNotDue) },
      { setTimer },
    );

    startup.onServerListening();

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it("defaults the timer and scheduler", async () => {
    const runDueBackup = vi.fn(resolveNotDue);
    const startup = createStartupBackup({ runDueBackup }, { fallbackDelayMs: 1 });

    startup.onServerListening();

    await vi.waitFor(() => expect(runDueBackup).toHaveBeenCalledTimes(1));
  });

  it("unrefs the fallback timer so it never holds the process open", () => {
    const unref = vi.fn();
    const startup = createStartupBackup(
      { runDueBackup: vi.fn(resolveNotDue) },
      { schedule: (run) => run(), setTimer: () => ({ unref }) },
    );

    startup.onServerListening();

    expect(unref).toHaveBeenCalledTimes(1);
  });

  it("tolerates an injected timer that returns nothing", () => {
    const startup = createStartupBackup(
      { runDueBackup: vi.fn(resolveNotDue) },
      { schedule: (run) => run(), setTimer: () => undefined },
    );

    expect(() => startup.onServerListening()).not.toThrow();
  });

  it("logs a rejected run with the default logger without throwing", async () => {
    const error = new Error("snapshot blew up");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const startup = createStartupBackup({
      runDueBackup: () => Promise.reject(error),
    });

    startup.onHealthServed();

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[backup] unexpected failure",
        error,
      ),
    );
    consoleError.mockRestore();
  });

  it("uses the injected logger for a rejected run", async () => {
    const log = vi.fn();
    const startup = createStartupBackup(
      { runDueBackup: () => Promise.reject(new Error("boom")) },
      { log },
    );

    startup.onHealthServed();

    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
  });
});

describe("startup backup readiness gate", () => {
  let closeServer: (() => void) | undefined;

  afterEach(() => {
    closeServer?.();
    closeServer = undefined;
  });

  it("hands the run to the REAL scheduler after /health is served", async () => {
    // No `schedule` override and no captured callback: this drives the default
    // `setImmediate` scheduler through a real HTTP probe. The previous version
    // captured the callback and invoked it by hand, which never exercised the
    // scheduling it claimed to test.
    const runDueBackup = vi.fn(resolveNotDue);
    const startup = createStartupBackup(
      { runDueBackup },
      { setTimer: () => ({}) },
    );

    const app = new Hono();
    app.get("/health", (c) => c.json({ status: "ok" }));

    const server = serve(
      {
        fetch: (request, env) => {
          const response = app.fetch(request, env);
          if (new URL(request.url).pathname === "/health") {
            startup.onHealthServed();
          }
          return response;
        },
        port: 0,
        hostname: "127.0.0.1",
      },
      () => startup.onServerListening(),
    );
    closeServer = () => server.close();
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    expect(startup.hasScheduled()).toBe(true);
    // Readiness was the gate; the run lands on a later event-loop turn (the
    // real scheduler), not inside the handler that answered the probe.
    await vi.waitFor(() => expect(runDueBackup).toHaveBeenCalledTimes(1));
  });
});
