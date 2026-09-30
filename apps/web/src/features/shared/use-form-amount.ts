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
  }
}

/**
 * useDateField() component.
 *
 * A date field starts on today's Algeria business day: the owner's rule that a
 * create/record form opens with the sensible default already filled in. The
 * `initialValue` parameter exists for tests only — app code never overrides it,
 * which the web-hygiene scan enforces.
 */
export function useDateField(initialValue = getAlgeriaDateInputValue()) {
  const [date, setDate] = useState(initialValue)

  return {
    date,
    setDate,
    reset: () => setDate(initialValue),
    isEmpty: date.trim().length === 0,
  }
}
