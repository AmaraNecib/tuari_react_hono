import { afterEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";

const originalArgv = process.argv;
const originalKey = process.env.APP_DB_KEY;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  if (originalKey === undefined) delete process.env.APP_DB_KEY;
  else process.env.APP_DB_KEY = originalKey;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.doUnmock("./restore-standalone-snapshot");
  vi.resetModules();
});

async function run(args: string[], restore: (...args: unknown[]) => unknown) {
  process.argv = ["node", "cli", ...args];
  vi.doMock("./restore-standalone-snapshot", () => ({ restoreStandaloneSnapshot: restore }));
  await import("./restore-standalone-snapshot.cli");
}

it.each([[[]], [["snapshot"]], [["snapshot", "destination", "extra"]]])("prints usage and exits for invalid args %j", async args => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const restore = vi.fn();
  await run(args, restore);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  expect(process.exitCode).toBe(1);
  expect(restore).not.toHaveBeenCalled();
});

it.each([undefined, "secret-key"])("restores with resolved paths and the configured key %s", async key => {
  if (key === undefined) delete process.env.APP_DB_KEY;
  else process.env.APP_DB_KEY = key;
  const restore = vi.fn(async () => ({ verified: 3, databasePath: "/restored/tuari.sqlite" }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await run(["relative-snapshot", "relative-destination"], restore);
  expect(restore).toHaveBeenCalledWith(resolve("relative-snapshot"), resolve("relative-destination"), key ?? "");
  expect(log).toHaveBeenCalledWith(expect.stringContaining("3 referenced files"));
  expect(process.exitCode).toBe(originalExitCode);
});

it.each([new Error("disk failed"), "unexpected rejection"])("reports restore failure %#", async failure => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await run(["snapshot", "destination"], vi.fn(async () => { throw failure; }));
  expect(error).toHaveBeenCalledWith(expect.stringContaining("Restore is incomplete"));
  expect(error).toHaveBeenCalledWith(failure instanceof Error ? failure.message : failure);
  expect(process.exitCode).toBe(1);
});
