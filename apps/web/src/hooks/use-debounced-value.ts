import { useEffect, useState } from "react"

/**
 * Trailing-edge debounce for a changing value.
 *
 * Returns the latest `value` only after it has stayed unchanged for
 * `delayMs` — each change restarts the timer and the pending timer is
 * cleared on unmount. Used to keep expensive work (e.g. Fuse fuzzy
 * search) off the per-keystroke hot path (issue #280).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
