import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { installRuntimeEvents } from "./runtime-events";
import { StructuredLogger } from "./logger";
import type { EventSink } from "./event-sink";

it("preserves the original rejection stack on stderr when storage is degraded", () => {
  const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  const sink: EventSink = { emit: vi.fn(), flush: vi.fn(), degraded: true };
  const emitter = new EventEmitter();
  const uninstall = installRuntimeEvents(sink, emitter);
  const error = new Error("original rejection reason");
  try {
    emitter.emit("unhandledRejection", error);
    expect(stderr).toHaveBeenCalledWith(error.stack);
  } finally { uninstall(); }
});

afterEach(() => { StructuredLogger.setSink(undefined); vi.restoreAllMocks(); });
it("routes structured errors, fatal hooks, shutdown and slow operations through one sink", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  const sink: EventSink = { emit: vi.fn(), flush: vi.fn(), degraded: false };
  const events = new EventEmitter();
  const uninstall = installRuntimeEvents(sink, events);
  StructuredLogger.error("structured", new Error("failure"));
  events.emit("uncaughtExceptionMonitor", new Error("fatal"));
  events.emit("unhandledRejection", new Error("rejected"));
  events.emit("exit");
  vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(2001);
  expect(StructuredLogger.measureOperation("slow", () => 42)).toBe(42);
  expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ source: "api", severity: "error", message: "structured" }));
  expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ message: "uncaughtException" }));
  expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ message: "shutdown", lifecycle: true }));
  expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ message: "slow slow operation", severity: "warn" }));
  expect(sink.flush).toHaveBeenCalledTimes(2);
  expect(console.error).not.toHaveBeenCalled();
  uninstall();
  expect(events.listenerCount("uncaughtExceptionMonitor")).toBe(0);
  expect(events.listenerCount("unhandledRejection")).toBe(0);
});
