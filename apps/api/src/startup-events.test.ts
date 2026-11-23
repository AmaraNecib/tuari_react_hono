import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { LocalEventSink } from "./infrastructure/observability/event-sink";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it.each([false, true])("normal entry records database initialization, failure=%s", async failure => {
  vi.resetModules();
  const root = mkdtempSync(join(tmpdir(), "tuari-startup-events-")); roots.push(root);
  const sink = new LocalEventSink(root, { prefix: "api" });
  const records = () => readdirSync(root).flatMap(day => readFileSync(join(root, day, "api.log"), "utf8").trim().split("\n").map(line => JSON.parse(line)));
  vi.doMock("./infrastructure/observability/runtime-events", () => ({ createRuntimeSink: () => sink, installRuntimeEvents: vi.fn() }));
  vi.doMock("./config", () => ({ createAppConfig: () => ({}) }));
  vi.doMock("./app/fresh-exact-dependencies", () => ({ createFreshExactAppDependencies: async () => {
    if (failure) throw new Error("database initialization failed");
    return { close: vi.fn(), backupService: {} };
  } }));
  vi.doMock("./app/create-app", () => ({ createApp: () => ({ fetch: vi.fn() }) }));
  vi.doMock("./modules/backup/backup.scheduler", () => ({ createStartupBackup: () => ({ onHealthServed: vi.fn(), onServerListening: vi.fn() }) }));
  vi.doMock("./app/shutdown", () => ({ installShutdownHook: vi.fn() }));
  vi.doMock("@hono/node-server", () => ({ serve: vi.fn() }));
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
});
