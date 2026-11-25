import { useEffect, useRef, useState } from "react"
import { createErrorId, formatErrorCode, recordUiFailure } from "./error-correlation"

type Failure = { attempt: number; id: number }
// Weak ownership keeps raw errors out of persistent storage and releases settled queries.
const failures = new WeakMap<object, Failure>()

/** Add a support code only where an operational failure is actually visible. */
export function FailureCode({ error, attempt = 0 }: { error: unknown; attempt?: number }) {
  const fallback = useRef({})
  const [visible, setVisible] = useState<{ error: unknown; attempt: number; id: number } | null>(null)
  useEffect(() => {
    if (error == null) return
    const owner = typeof error === "object" || typeof error === "function" ? error : fallback.current
    let failure = failures.get(owner)
    if (!failure || failure.attempt !== attempt) {
      failure = { attempt, id: createErrorId() }
      failures.set(owner, failure)
      void recordUiFailure(failure.id)
    }
    setVisible({ error, attempt, id: failure.id })
  }, [error, attempt])
  if (!visible || error == null || visible.error !== error || visible.attempt !== attempt) return null
  return <bdi dir="ltr" className="mt-1 block font-mono text-xs">{formatErrorCode(visible.id)}</bdi>
}
