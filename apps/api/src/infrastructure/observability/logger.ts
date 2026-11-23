/**
 * Structured logging for API observability.
 * Provides request tracing, error context, and performance metrics.
 */

import { localTimestamp, type EventSink } from "./event-sink";

export interface LogContext {
  requestId: string;
  userId?: string;
  operation?: string;
  timestamp: number;
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context: LogContext;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  duration?: number; // milliseconds
}

export class StructuredLogger {
  private static context: LogContext | null = null;
  private static sink?: EventSink;

  static setSink(sink: EventSink | undefined): void { this.sink = sink; }

  /**
   * Initialize logging context for a request.
   */
  static initContext(requestId: string, userId?: string): LogContext {
    this.context = {
      requestId,
      userId,
      timestamp: Date.now(),
    };
    return this.context;
  }

  /**
   * Get current context or create a new one.
   */
  static getContext(): LogContext {
    if (!this.context) {
      this.context = {
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
      };
    }
    return this.context;
  }

  /**
   * Clear context (typically at end of request).
   */
  static clearContext(): void {
    this.context = null;
  }

  /**
   * Log info level message.
   */
  static info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  /**
   * Log error level message.
   */
  static error(
    message: string,
    error?: Error,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      level: "error",
      message,
      context: this.getContext(),
      data,
      error: error
        ? {
            code: error.constructor.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };
    this.output(entry);
  }

  /**
   * Log warning level message.
   */
  static warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  /**
   * Log debug level message.
   */
  static debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  /**
   * Measure operation performance.
   */
  static measureOperation<T>(
    name: string,
    operation: () => T,
  ): T {
    const start = Date.now();
    try {
      const result = operation();
      const duration = Date.now() - start;
      if (duration > 2000) this.warn(`${name} slow operation`, { duration });
      this.info(`${name} completed`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${name} failed`, error as Error, { duration });
      throw error;
    }
  }

  /**
   * Async version of measureOperation.
   */
  static async measureOperationAsync<T>(
    name: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - start;
      if (duration > 2000) this.warn(`${name} slow operation`, { duration });
      this.info(`${name} completed`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${name} failed`, error as Error, { duration });
      throw error;
    }
  }

  private static log(
    level: LogEntry["level"],
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      level,
      message,
      context: this.getContext(),
      data,
    };
    this.output(entry);
  }

  private static output(entry: LogEntry): void {
    try { this.outputUnchecked(entry); }
    catch {
      try { console.error("Local logging degraded"); } catch { /* Logging never owns application control flow. */ }
    }
  }

  private static outputUnchecked(entry: LogEntry): void {
    this.sink?.emit({ severity: entry.level, source: "api", message: entry.message,
      attributes: { ...entry.data, error: entry.error, requestId: entry.context.requestId } });
    const logLine = JSON.stringify({
      timestamp: localTimestamp(),
      level: entry.level.toUpperCase(),
      requestId: entry.context.requestId,
      userId: entry.context.userId,
      message: entry.message,
      ...entry.data,
      ...(entry.error && { error: entry.error }),
      ...(entry.duration !== undefined && { durationMs: entry.duration }),
    });

    // Output based on level
    switch (entry.level) {
      case "error":
        console.error(logLine);
        break;
      case "warn":
        console.warn(logLine);
        break;
      case "debug":
        console.debug(logLine);
        break;
      case "info":
      default:
        console.log(logLine);
    }
  }
}
