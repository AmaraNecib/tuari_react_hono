/**
 * Hook for managing form amount values with formatting.
 */
import { useState } from "react"
import { getAlgeriaDateInputValue } from "@/lib/algeria-time"

/**
 * useFormAmount(initialValue = "") component.
 */
export function useFormAmount(initialValue = "") {
  const [amount, setAmount] = useState(initialValue)

  const normalized = amount.trim()
  const value = normalized.length > 0 ? Number(normalized) : null
  const isValid = value !== null && Number.isFinite(value) && value > 0

  return {
    amount,
    setAmount,
    value,
    isValid,
    reset: () => setAmount(initialValue),
    isEmpty: normalized.length === 0,
/**
 * useDateField(initialValue = "") component.
 */
  }
}

export function useDateField(initialValue = getAlgeriaDateInputValue()) {
  const [date, setDate] = useState(initialValue)

  return {
    date,
    setDate,
    reset: () => setDate(initialValue),
    isEmpty: date.trim().length === 0,
  }
}
