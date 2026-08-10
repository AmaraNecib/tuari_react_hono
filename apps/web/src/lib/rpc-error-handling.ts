/**
 * Extracts a user-facing message from an RPC error.
 *
 * Prefers the first validation issue attached by the ORPC contract wire gate
 * (`data.issues`, carrying per-field zod messages), then falls back to the
 * error's own message — suppressing the generic "Input validation failed"
 * string when no issues are attached so callers can apply their fallback.
 * (#278: issues must win regardless of the message text.)
 */
export function extractRpcIssueMessage(error: unknown): string | null {
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>
    const directData = obj["data"]

    if (typeof directData === "object" && directData !== null) {
      const data = directData as Record<string, unknown>
      const issues = data["issues"]
      if (Array.isArray(issues)) {
        // Return the first issue that carries a non-empty message, so an
        // empty/whitespace first issue doesn't hide a valid later one.
        for (const candidate of issues) {
          if (typeof candidate === "object" && candidate !== null) {
            const issue = candidate as Record<string, unknown>
            const message = issue["message"]
            if (typeof message === "string" && message.trim().length > 0) {
              return message
            }
          }
        }
      }
    }
  }

  if (error instanceof Error && error.message.trim().length > 0 && error.message !== "Input validation failed") {
    return error.message
  }

  return null
}

/**
 * Builds a user-facing error message, preferring an extracted RPC issue and
 * suppressing the generic "Input validation failed" string so the fallback
 * wins when no per-field detail is available (#278).
 */
export function buildErrorMessage(error: unknown, fallbackMessage: string): string {
  const extracted = extractRpcIssueMessage(error)
  if (extracted !== null) {
    return extracted
  }
  if (error instanceof Error && error.message.trim().length > 0 && error.message !== "Input validation failed") {
    return error.message
  }
  return fallbackMessage
}
