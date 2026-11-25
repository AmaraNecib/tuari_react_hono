import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { LocalEventSink } from "./infrastructure/observability/event-sink";
import type { ShutdownOptions, ShutdownTargets } from "./app/shutdown";

const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it.each(["startup success", "startup failure", "database close failure", "shutdown timeout"])("normal entry captures %s", async scenario => {
  vi.resetModules();
  const failure = scenario === "startup failure";
  const root = mkdtempSync(join(tmpdir(), "tuari-startup-events-")); roots.push(root);
  const sink = new LocalEventSink(root, { prefix: "api" });
  const records = () => readdirSync(root).flatMap(day => readFileSync(join(root, day, "api.log"), "utf8").trim().split("\n").map(line => JSON.parse(line)));
  const close = vi.fn();
  const install = vi.fn<(targets: ShutdownTargets, options?: ShutdownOptions) => void>();
  vi.doMock("./infrastructure/observability/runtime-events", () => ({ createRuntimeSink: () => sink, installRuntimeEvents: vi.fn() }));
  vi.doMock("./config", () => ({ createAppConfig: () => ({}) }));
  vi.doMock("./app/fresh-exact-dependencies", () => ({ createFreshExactAppDependencies: async () => {
    if (failure) throw new Error("database initialization failed");
    return { close, backupService: {} };
  } }));
  vi.doMock("./app/create-app", () => ({ createApp: () => ({ fetch: vi.fn() }) }));
  vi.doMock("./modules/backup/backup.scheduler", () => ({ createStartupBackup: () => ({ onHealthServed: vi.fn(), onServerListening: vi.fn() }) }));
  vi.doMock("./app/shutdown", () => ({ installShutdownHook: install }));
  vi.doMock("@hono/node-server", () => ({ serve: () => ({ close: (done: () => void) => { if (scenario !== "shutdown timeout") done(); } }) }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  await import("./index");
  await vi.waitFor(() => expect(records().some(event => event.message === (failure ? "startup failed" : "database initialization complete"))).toBe(true));
  expect(records()).toEqual(expect.arrayContaining([
    expect.objectContaining({ message: "startup", severity: "info", lifecycle: true }),
    expect.objectContaining({ message: "database initialization started", severity: "info", lifecycle: true }),
    expect.objectContaining(failure ? { message: "startup failed", severity: "error" } : { message: "database initialization complete", severity: "info", lifecycle: true }),
  ]));
  expect(exit).toHaveBeenCalledTimes(failure ? 1 : 0);
  if (scenario === "database close failure" || scenario === "shutdown timeout") {
    await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    const [targets, options] = install.mock.calls[0]!;
    const { createShutdownHandler } = await vi.importActual<typeof import("./app/shutdown")>("./app/shutdown");
    const finish = vi.fn() as unknown as (code?: number) => never;
    const handler = createShutdownHandler(targets, { ...options, exit: finish, forceExitTimeoutMs: 10 });
    if (scenario === "database close failure") {
      close.mockImplementationOnce(() => { throw new Error("database close probe"); });
      await handler();
      expect(records()).toContainEqual(expect.objectContaining({ severity: "error", lifecycle: true, message: "Failed to close the database connection cleanly: database close probe" }));
      expect(finish).toHaveBeenCalledWith(0);
    } else {
      vi.useFakeTimers();
      void handler();
      await vi.advanceTimersByTimeAsync(10);
      expect(records()).toContainEqual(expect.objectContaining({ severity: "error", lifecycle: true, message: "Shutdown timed out — forcing exit" }));
      expect(finish).toHaveBeenCalledWith(1);
    }
  }
});
