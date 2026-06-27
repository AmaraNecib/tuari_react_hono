/**
 * Extracts error messages from RPC errors.
 */
export function extractRpcIssueMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0 && error.message !== "Input validation failed") {
    return error.message
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>
    const directData = obj["data"]

    if (typeof directData === "object" && directData !== null) {
      const data = directData as Record<string, unknown>
      const issues = data["issues"]
      if (Array.isArray(issues) && issues.length > 0) {
        const firstIssue = issues[0]
        if (typeof firstIssue === "object" && firstIssue !== null) {
          const issue = firstIssue as Record<string, unknown>
          const message = issue["message"]
          if (typeof message === "string" && message.trim().length > 0) {
            return message
          }
        }
      }
    }
  }

  return null
}

/**
 * buildErrorMessage(error component.
 */
export function buildErrorMessage(error: unknown, fallbackMessage: string): string {
  return extractRpcIssueMessage(error) ?? (error instanceof Error && error.message.trim().length > 0 ? error.message : fallbackMessage)
}
