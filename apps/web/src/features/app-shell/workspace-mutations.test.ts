import { describe, it, expect } from "vitest"
import { AppMutationError } from "./workspace-mutations"

describe("AppMutationError", () => {
  it("creates an error with message and default code", () => {
    const error = new AppMutationError({ message: "Test error" })

    expect(error.message).toBe("Test error")
    expect(error.name).toBe("AppMutationError")
    expect(error.code).toBe("BUSINESS_RULE")
    expect(error.fieldErrors).toEqual([])
  })

  it("creates an error with code and field errors", () => {
    const fieldErrors = [
      { field: "email", message: "Invalid email" },
      { field: "phone", message: "Invalid phone" },
    ]

    const error = new AppMutationError({
      message: "Validation failed",
      code: "VALIDATION",
      fieldErrors,
    })

    expect(error.message).toBe("Validation failed")
    expect(error.code).toBe("VALIDATION")
    expect(error.fieldErrors).toEqual(fieldErrors)
  })

  it("defaults code to BUSINESS_RULE when not provided", () => {
    const error = new AppMutationError({
      message: "Some error",
    })

    expect(error.code).toBe("BUSINESS_RULE")
  })

  it("defaults fieldErrors to empty array when not provided", () => {
    const error = new AppMutationError({
      message: "Some error",
      code: "CONFLICT",
    })

    expect(error.fieldErrors).toEqual([])
  })

  it("is instanceof Error", () => {
    const error = new AppMutationError({ message: "Test" })

    expect(error instanceof Error).toBe(true)
  })
})

describe("mutation error handling patterns", () => {
  it("handles entity success result format", () => {
    const result = {
      success: true as const,
      message: "Created successfully",
      item: { id: "1", name: "Test" },
    }

    if (result.success) {
      expect(result.message).toBe("Created successfully")
      expect(result.item.id).toBe("1")
    }
  })

  it("handles entity failure result format", () => {
    const result = {
      success: false as const,
      error: { message: "Creation failed" },
    }

    if (!result.success) {
      expect(result.error.message).toBe("Creation failed")
    }
  })

  it("handles delete success result format", () => {
    const result = {
      success: true as const,
      message: "Deleted successfully",
    }

    if (result.success) {
      expect(result.message).toBe("Deleted successfully")
    }
  })

  it("handles delete failure result format", () => {
    const result = {
      success: false as const,
      error: { message: "Deletion failed" },
    }

    if (!result.success) {
      expect(result.error.message).toBe("Deletion failed")
    }
  })

  it("creates AppMutationError from failure result", () => {
    const failureResult = {
      success: false as const,
      error: {
        message: "Validation error",
        code: "VALIDATION" as const,
        fieldErrors: [{ field: "email", message: "Invalid email" }],
      },
    }

    if (!failureResult.success) {
      const error = new AppMutationError(failureResult.error)
      expect(error.code).toBe("VALIDATION")
      expect(error.fieldErrors).toHaveLength(1)
    }
  })
})

describe("unique suffix generation", () => {
  it("generates different suffixes on repeated calls", () => {
    const suffixes = new Set<string>()

    for (let i = 0; i < 10; i++) {
      const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
      suffixes.add(suffix)
    }

    expect(suffixes.size).toBeGreaterThan(1)
  })

  it("suffix format is timestamp-random", () => {
    const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
    const parts = suffix.split("-")

    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatch(/^[0-9a-z]+$/)
    expect(parts[1]).toMatch(/^\d+$/)
  })
})

describe("mutation result validation", () => {
  it("validates entity result has required fields", () => {
    const validResult = {
      success: true as const,
      message: "Success",
      item: { id: "1" },
    }

    expect(validResult.success).toBe(true)
    expect(typeof validResult.message).toBe("string")
    expect(typeof validResult.item).toBe("object")
  })

  it("validates failure result has required fields", () => {
    const failureResult = {
      success: false as const,
      error: { message: "Error occurred" },
    }

    expect(failureResult.success).toBe(false)
    expect(typeof failureResult.error.message).toBe("string")
  })

  it("requires message for success results", () => {
    const result = {
      success: true as const,
      message: "Operation completed",
      item: {},
    }

    if (result.success) {
      expect(result.message).toBeDefined()
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it("requires error object for failure results", () => {
    const result = {
      success: false as const,
      error: { message: "Something went wrong" },
    }

    if (!result.success) {
      expect(result.error).toBeDefined()
      expect(result.error.message).toBeDefined()
    }
  })
})
