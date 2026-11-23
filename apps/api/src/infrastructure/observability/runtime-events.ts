import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { LocalEventSink, type EventSink } from "./event-sink";
import { StructuredLogger } from "./logger";

export function installRuntimeEvents(sink: EventSink, emitter: EventEmitter = process): () => void {
  StructuredLogger.setSink(sink);
  const exception = (error: unknown) => {
    sink.emit({ severity: "error", source: "api", message: "uncaughtException", attributes: { error: error instanceof Error ? error.stack : String(error) } });
    sink.flush();
  };
  const rejection = (error: unknown) => {
    exception(error);
    if (emitter === process) process.exit(1);
  };
  // Observe fatal exceptions without suppressing Node's default termination.
  emitter.on("uncaughtExceptionMonitor", exception);
  emitter.on("unhandledRejection", rejection);
  const exit = () => { sink.emit({ severity: "info", source: "api", message: "shutdown", lifecycle: true }); };
  emitter.on("exit", exit);
  return () => {
    emitter.off("uncaughtExceptionMonitor", exception);
    emitter.off("unhandledRejection", rejection);
    emitter.off("exit", exit);
    StructuredLogger.setSink(undefined);
  };
}

export function createRuntimeSink(): LocalEventSink {
  const root = process.env.TUARI_LOGS_DIR ?? join(dirname(process.env.APP_DB_PATH ?? "data/tuari.sqlite"), "logs");
  return new LocalEventSink(root, { prefix: "api", totalBytes: 100 * 1024 * 1024 });
}
