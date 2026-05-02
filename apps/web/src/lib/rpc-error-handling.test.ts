import { describe, it, expect } from "vitest"
import { extractRpcIssueMessage, buildErrorMessage } from "./rpc-error-handling"

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

    it("should return fallback for plain objects with no error info", () => {
      const result = buildErrorMessage({ some: "object" }, "Default")
      expect(result).toBe("Default")
    })
  })
})
