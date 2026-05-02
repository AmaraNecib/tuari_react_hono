import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useFormAmount, useDateField } from "./use-form-amount"

describe("useFormAmount", () => {
  it("should initialize with empty string", () => {
    const { result } = renderHook(() => useFormAmount())
    expect(result.current.amount).toBe("")
    expect(result.current.value).toBeNull()
    expect(result.current.isEmpty).toBe(true)
  })

  it("should initialize with provided default value", () => {
    const { result } = renderHook(() => useFormAmount("100"))
    expect(result.current.amount).toBe("100")
  })

  it("should parse valid number", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("123.45")
    })
    expect(result.current.value).toBe(123.45)
    expect(result.current.isValid).toBe(true)
  })

  it("should return null for empty string", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("")
    })
    expect(result.current.value).toBeNull()
    expect(result.current.isValid).toBe(false)
  })

  it("should return NaN for non-numeric input", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("abc")
    })
    expect(Number.isNaN(result.current.value)).toBe(true)
    expect(result.current.isValid).toBe(false)
  })

  it("should invalidate zero", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("0")
    })
    expect(result.current.value).toBe(0)
    expect(result.current.isValid).toBe(false)
  })

  it("should invalidate negative numbers", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("-50")
    })
    expect(result.current.value).toBe(-50)
    expect(result.current.isValid).toBe(false)
  })

  it("should trim whitespace in validation", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("  50.5  ")
    })
    expect(result.current.value).toBe(50.5)
    expect(result.current.isValid).toBe(true)
  })

  it("should mark as empty when only whitespace", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("   ")
    })
    expect(result.current.isEmpty).toBe(true)
  })

  it("should validate infinity as invalid", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("Infinity")
    })
    expect(result.current.isValid).toBe(false)
  })

  it("should reset to initial value", () => {
    const { result } = renderHook(() => useFormAmount("99"))
    act(() => {
      result.current.setAmount("50")
    })
    expect(result.current.value).toBe(50)
    act(() => {
      result.current.reset()
    })
    expect(result.current.amount).toBe("99")
  })

  it("should handle large numbers", () => {
    const { result } = renderHook(() => useFormAmount())
    act(() => {
      result.current.setAmount("999999999.99")
    })
    expect(result.current.value).toBe(999999999.99)
    expect(result.current.isValid).toBe(true)
  })
})

describe("useDateField", () => {
  it("should initialize with empty string", () => {
    const { result } = renderHook(() => useDateField())
    expect(result.current.date).toBe("")
    expect(result.current.isEmpty).toBe(true)
  })

  it("should initialize with default value", () => {
    const { result } = renderHook(() => useDateField("2025-05-02"))
    expect(result.current.date).toBe("2025-05-02")
    expect(result.current.isEmpty).toBe(false)
  })

  it("should update date", () => {
    const { result } = renderHook(() => useDateField())
    act(() => {
      result.current.setDate("2025-12-25")
    })
    expect(result.current.date).toBe("2025-12-25")
  })

  it("should reset to initial value", () => {
    const { result } = renderHook(() => useDateField("2025-01-01"))
    act(() => {
      result.current.setDate("2025-06-15")
    })
    act(() => {
      result.current.reset()
    })
    expect(result.current.date).toBe("2025-01-01")
  })

  it("should mark as empty when whitespace", () => {
    const { result } = renderHook(() => useDateField())
    act(() => {
      result.current.setDate("   ")
    })
    expect(result.current.isEmpty).toBe(true)
  })
})
