import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StructuredLogger } from "./logger";

describe("StructuredLogger", () => {
  beforeEach(() => {
    StructuredLogger.clearContext();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("context management", () => {
    it("initializes context with requestId", () => {
      const context = StructuredLogger.initContext("req-123");
      expect(context.requestId).toBe("req-123");
      expect(context.timestamp).toBeDefined();
    });

    it("includes userId in context when provided", () => {
      const context = StructuredLogger.initContext("req-123", "user-456");
      expect(context.userId).toBe("user-456");
    });

    it("returns same context on subsequent calls", () => {
      StructuredLogger.initContext("req-123");
      const context1 = StructuredLogger.getContext();
      const context2 = StructuredLogger.getContext();
      expect(context1).toBe(context2);
    });

    it("creates new context if not initialized", () => {
      StructuredLogger.clearContext();
      const context = StructuredLogger.getContext();
      expect(context.requestId).toBeDefined();
    });

    it("clears context", () => {
      StructuredLogger.initContext("req-123");
      StructuredLogger.clearContext();
      // New context should have different requestId
      const newContext = StructuredLogger.getContext();
      expect(newContext.requestId).not.toBe("req-123");
    });
  });

  describe("logging", () => {
    it("logs info messages", () => {
      const spy = vi.spyOn(console, "log");
      StructuredLogger.info("Test message", { data: "value" });
      expect(spy).toHaveBeenCalled();
    });

    it("logs error with exception", () => {
      const spy = vi.spyOn(console, "error");
      const error = new Error("Test error");
      StructuredLogger.error("Error occurred", error);
      expect(spy).toHaveBeenCalled();
    });

    it("logs warning messages", () => {
      const spy = vi.spyOn(console, "warn");
      StructuredLogger.warn("Warning message");
      expect(spy).toHaveBeenCalled();
    });

    it("logs debug messages", () => {
      const spy = vi.spyOn(console, "debug");
      StructuredLogger.debug("Debug message");
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("performance measurement", () => {
    it("measures synchronous operation", () => {
      const spy = vi.spyOn(console, "log");
      const result = StructuredLogger.measureOperation("test-op", () => {
        return 42;
      });
      expect(result).toBe(42);
      expect(spy).toHaveBeenCalled();
    });

    it("measures operation duration", () => {
      const spy = vi.spyOn(console, "log");
      StructuredLogger.measureOperation("test-op", () => {
        // Operation completes quickly
        return true;
      });
      expect(spy).toHaveBeenCalled();
      // Check that duration was logged
      const call = spy.mock.calls[0]?.[0];
      expect(call).toContain("completed");
    });

    it("handles operation errors and logs duration", () => {
      const spy = vi.spyOn(console, "error");
      expect(() => {
        StructuredLogger.measureOperation("test-op", () => {
          throw new Error("Operation failed");
        });
      }).toThrow();
      expect(spy).toHaveBeenCalled();
    });

    it("measures async operation", async () => {
      const spy = vi.spyOn(console, "log");
      const result = await StructuredLogger.measureOperationAsync("async-op", async () => {
        return Promise.resolve(42);
      });
      expect(result).toBe(42);
      expect(spy).toHaveBeenCalled();
    });

    it("handles async operation errors", async () => {
      const spy = vi.spyOn(console, "error");
      await expect(
        StructuredLogger.measureOperationAsync("async-op", async () => {
          return Promise.reject(new Error("Async failed"));
        }),
      ).rejects.toThrow();
      expect(spy).toHaveBeenCalled();
    });
  });
});
