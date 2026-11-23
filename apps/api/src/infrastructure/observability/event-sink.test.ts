import { mkdtempSync, readFileSync, rmSync, readdirSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { LocalEventSink } from "./event-sink";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it("keeps only the last buffered events and flushes them once on an error", () => {
  const dir = root();
  const sink = new LocalEventSink(dir, { ringSize: 2 });
  for (const message of ["old", "recent", "last"]) sink.emit({ severity: "info", source: "api", message });
  expect(readdirSync(dir)).toEqual([]);
  sink.emit({ severity: "error", source: "api", message: "failure" });
  const day = readdirSync(dir)[0]!;
  const events = readFileSync(join(dir, day, "app.log"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(events.map(e => e.message)).toEqual(["recent", "last", "failure"]);
});
it("splits chunks and aggregates repeated errors into one counted record", () => {
  const dir = root();
  const sink = new LocalEventSink(dir, { chunkBytes: 250, now: () => new Date("2025-08-10T12:00:00Z") });
  const event = { severity: "error" as const, source: "api", message: "repeat", timestamp: "2025-08-10T12:00:00.000+01:00" };
  sink.emit(event); sink.emit(event); sink.emit(event);
  sink.flush();
  const records = readFileSync(join(dir, "2025-08-10", "app.log"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(records).toHaveLength(1);
  expect(records[0].count).toBe(3);
  sink.emit({ ...event, message: "next", timestamp: "2025-08-10T12:02:00.000+01:00" });
  expect(readdirSync(join(dir, "2025-08-10"))).toContain("app.1.log");
});
it("cleans expired owned logs on startup and enforces a live total cap", () => {
  const dir = root();
  mkdirSync(join(dir, "2025-07-01"));
  writeFileSync(join(dir, "2025-07-01", "app.log"), "old\n");
  writeFileSync(join(dir, "2025-07-01", "unrelated.txt"), "keep");
  const sink = new LocalEventSink(dir, { now: () => new Date("2025-08-10T12:00:00Z"), totalBytes: 300, chunkBytes: 180 });
  expect(existsSync(join(dir, "2025-07-01", "app.log"))).toBe(false);
  expect(readFileSync(join(dir, "2025-07-01", "unrelated.txt"), "utf8")).toBe("keep");
  for (let n = 0; n < 5; n++) sink.emit({ severity: "warn", source: "api", message: String(n) });
  const day = join(dir, "2025-08-10");
  expect(readdirSync(day).reduce((sum, name) => sum + statSync(join(day, name)).size, 0)).toBeLessThanOrEqual(300);
});
it("repairs a partial trailing line without losing the next event", () => {
  const dir = root();
  mkdirSync(join(dir, "2025-08-10"));
  const file = join(dir, "2025-08-10", "app.log");
  writeFileSync(file, '{"message":"kept"}\n{"trunc');
  const sink = new LocalEventSink(dir, { now: () => new Date("2025-08-10T12:00:00Z") });
  sink.emit({ severity: "warn", source: "api", message: "next" });
  expect(readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line).message)).toEqual(["kept", "next"]);
});
it("never throws on unavailable storage and marks degraded", () => {
  const dir = root(); const file = join(dir, "not-a-directory");
  writeFileSync(file, "file");
  const sink = new LocalEventSink(file);
  expect(() => sink.emit({ severity: "error", source: "api", message: "failure" })).not.toThrow();
  expect(sink.degraded).toBe(true);
});
it("routes timezone changes using event dates rather than instant order", () => {
  const dir = root();
  const sink = new LocalEventSink(dir, { now: () => new Date("2025-08-10T12:00:00Z") });
  sink.emit({ severity: "warn", source: "api", message: "east", timestamp: "2025-08-11T00:30:00.000+02:00" });
  sink.emit({ severity: "warn", source: "api", message: "west", timestamp: "2025-08-10T23:45:00.000+01:00" });
  expect(readdirSync(dir).sort()).toEqual(["2025-08-10", "2025-08-11"]);
});
function root() { const path = mkdtempSync(join(tmpdir(), "tuari-events-")); roots.push(path); return path; }
it("routes each event by its own local date and retains its offset across midnight", () => {
  const dir = root();
  const sink = new LocalEventSink(dir, { now: () => new Date("2025-08-10T12:00:00Z") });
  sink.emit({ severity: "warn", source: "api", message: "before", timestamp: "2025-08-10T23:55:45.123+01:00" });
  sink.emit({ severity: "warn", source: "api", message: "after", timestamp: "2025-08-11T00:00:01.000+01:00" });
  expect(readdirSync(dir).sort()).toEqual(["2025-08-10", "2025-08-11"]);
  expect(JSON.parse(readFileSync(join(dir, "2025-08-10", "app.log"), "utf8")).timestamp).toBe("2025-08-10T23:55:45.123+01:00");
});
