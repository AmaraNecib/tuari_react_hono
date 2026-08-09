import { useEffect, useState } from "react"

/**
 * Trailing-edge debounce for a changing value.
 *
 * Returns the latest `value` only after it has stayed unchanged for
 * `delayMs` — each change restarts the timer and the pending timer is
 * cleared on unmount. Used to keep expensive work (e.g. Fuse fuzzy
 * search) off the per-keystroke hot path (issue #280).
 *
 * `resetKey` is optional: when it changes, the debounced value is flushed
 * synchronously to `value`, cancelling any pending timer. This lets a
 * caller reset the debounce on an external signal (e.g. a dialog reopening)
 * so a stale value can never leak across state transitions.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, resetKey?: unknown): T {
  const [debounced, setDebounced] = useState(value)
  const [lastResetKey, setLastResetKey] = useState(resetKey)

  // React-recommended "adjusting state when props change" pattern: reset the
  // debounced value during render when the reset signal flips.
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setDebounced(value)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
