import { describe, it, expect } from "vitest"
import { extractRpcIssueMessage, buildErrorMessage } from "./rpc-error-handling"

/**
 * Replicates the ORPCError instance the web client reconstructs from the
 * ORPC contract wire gate (BAD_REQUEST / "Input validation failed" /
 * data.issues with zod field paths). The client preserves `data` over HTTP.
 */
class WireGateError extends Error {
  code = "BAD_REQUEST"
  status = 400
  data: { issues: Array<{ message: string; path: Array<string | number> }> }
  constructor(message: string, issues: Array<{ message: string; path: Array<string | number> }>) {
    super(message)
    this.data = { issues }
  }
}

describe("rpc-error-handling", () => {
  describe("extractRpcIssueMessage", () => {
    it("should extract message from Error instance", () => {
      const error = new Error("Something went wrong")
      const result = extractRpcIssueMessage(error)
      expect(result).toBe("Something went wrong")
    })

    it("should return null for Error with empty message", () => {
      const error = new Error("")
      const result = extractRpcIssueMessage(error)
      expect(result).toBeNull()
    })

    it("should return null for Error with whitespace message", () => {
      const error = new Error("   ")
      const result = extractRpcIssueMessage(error)
      expect(result).toBeNull()
    })

    it("should return null for generic input validation failed message", () => {
      const error = new Error("Input validation failed")
      const result = extractRpcIssueMessage(error)
      expect(result).toBeNull()
    })

    it("should extract the first zod issue from the real wire-gate error shape", () => {
      // The ORPC contract gate attaches data.issues (field paths + messages);
      // the web must surface the field detail, not the generic message. (#278)
      const error = new WireGateError("Input validation failed", [
        { message: "Too small: expected string to have >=1 characters", path: ["name"] },
        { message: "Invalid string: must match pattern /^(05|06|07)\\d{8}$/", path: ["phone"] },
      ])
      const result = extractRpcIssueMessage(error)
      expect(result).toBe("Too small: expected string to have >=1 characters")
    })

    it("should prefer data.issues even when the message is not the generic one", () => {
      // Any ORPC error carrying issues must surface the field message regardless
      // of the message string — not depend on the magic "Input validation failed".
      // An Error instance with a non-generic message is the case the old
      // message-first logic got wrong.
      const error = new WireGateError("Invalid input: validation failed", [
        { message: "Field-level detail", path: ["name"] },
      ])
      const result = extractRpcIssueMessage(error)
      expect(result).toBe("Field-level detail")
    })

    it("should extract message from ORPC error with data.issues array", () => {
      const error = {
        data: {
          issues: [
            { message: "First validation error", field: "email" },
            { message: "Second error", field: "password" },
          ],
        },
      }
      const result = extractRpcIssueMessage(error)
      expect(result).toBe("First validation error")
    })

    it("should return null when issues array is empty", () => {
      const error = {
        data: {
          issues: [],
        },
      }
      const result = extractRpcIssueMessage(error)
      expect(result).toBeNull()
    })

    it("should return null when issues[0] has empty message", () => {
      const error = {
        data: {
          issues: [{ message: "", field: "email" }],
        },
      }
      const result = extractRpcIssueMessage(error)
      expect(result).toBeNull()
    })

    it("should return null for null/undefined error", () => {
      expect(extractRpcIssueMessage(null)).toBeNull()
      expect(extractRpcIssueMessage(undefined)).toBeNull()
    })

    it("should return null for plain object without error data", () => {
      const error = { someField: "value" }
      const result = extractRpcIssueMessage(error)
      expect(result).toBeNull()
    })

    it("should return null for string error (not wrapped in Error)", () => {
      const result = extractRpcIssueMessage("plain string error")
      expect(result).toBeNull()
    })

    it("should trim whitespace from extracted message", () => {
      const error = {
        data: {
          issues: [{ message: "  trimmed message  " }],
        },
      }
      const result = extractRpcIssueMessage(error)
      expect(result).toBe("  trimmed message  ") // Raw extraction, trimming happens in buildErrorMessage
    })
  })

  describe("buildErrorMessage", () => {
    it("should return RPC extracted message when available", () => {
      const error = new Error("RPC error message")
      const result = buildErrorMessage(error, "fallback")
      expect(result).toBe("RPC error message")
    })

    it("should return error.message when RPC message not available", () => {
      const error = new Error("Direct error message")
      const result = buildErrorMessage(error, "fallback")
      expect(result).toBe("Direct error message")
    })

    it("should return fallback when no error messages available", () => {
      const result = buildErrorMessage(new Error(""), "Fallback message")
      expect(result).toBe("Fallback message")
    })

    it("should return fallback for null/undefined error", () => {
      expect(buildErrorMessage(null, "Fallback")).toBe("Fallback")
      expect(buildErrorMessage(undefined, "Fallback")).toBe("Fallback")
    })

    it("should prioritize RPC message over error.message", () => {
      const error = {
        message: "Error message",
        data: {
          issues: [{ message: "RPC message" }],
        },
      }
      const result = buildErrorMessage(error, "fallback")
      expect(result).toBe("RPC message")
    })

    it("should handle ORPC error structure", () => {
      const error = {
        data: {
          issues: [{ message: "Validation failed", code: "VALIDATION_FAILED" }],
        },
      }
      const result = buildErrorMessage(error, "fallback")
      expect(result).toBe("Validation failed")
    })

    it("should surface the wire-gate field message instead of the fallback", () => {
      // #278: the regression this issue pins — a validation failure must show
      // the zod field message, never the generic fallback toast.
      const error = new WireGateError("Input validation failed", [
        { message: "Too big: expected string to have <=160 characters", path: ["name"] },
      ])
      const result = buildErrorMessage(error, "تعذر إنشاء تعريف العنصر.")
      expect(result).toBe("Too big: expected string to have <=160 characters")
    })

    it("should return fallback for plain objects with no error info", () => {
      const result = buildErrorMessage({ some: "object" }, "Default")
      expect(result).toBe("Default")
    })
  })
})
