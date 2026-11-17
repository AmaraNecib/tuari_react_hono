import { i18n } from "@/i18n"

export type TranslatedRpcValidationIssue = {
  path: Array<string | number>
  field: string
  message: string
}

const RPC_VALIDATION_KEYS = new Set([
  "workforce.validation.salaryReference.invalid",
  "workforce.validation.salaryReference.amountType",
  "workforce.validation.salaryReference.amountLength",
  "workforce.validation.salaryReference.precision",
  "workforce.validation.earning.amountPrecision",
  "workforce.validation.earning.daysPositive",
  "workforce.validation.earning.periodOrder",
  "workforce.validation.earning.duplicateSegment",
  "workforce.validation.earning.positiveTotal",
  "workforce.validation.earning.conservation",
])

/**
 * Translates RPC validation issue identifiers and retains paths for form callers.
 * Unknown server messages remain literal user-facing text, never translation keys.
 */
export function translateRpcValidationIssues(error: unknown): TranslatedRpcValidationIssue[] {
  if (typeof error !== "object" || error === null) return []
  const data = (error as Record<string, unknown>)["data"]
  if (typeof data !== "object" || data === null) return []
  const issues = (data as Record<string, unknown>)["issues"]
  if (!Array.isArray(issues)) return []

  return issues.flatMap(candidate => {
    if (typeof candidate !== "object" || candidate === null) return []
    const issue = candidate as Record<string, unknown>
    const rawMessage = issue["message"]
    if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) return []
    const rawPath = issue["path"]
    const path = Array.isArray(rawPath)
      ? rawPath.filter((part): part is string | number => typeof part === "string" || typeof part === "number")
      : []
    const message = RPC_VALIDATION_KEYS.has(rawMessage) ? i18n.t(rawMessage) : rawMessage
    return [{ path, field: path.join("."), message }]
  })
}

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
      const issue = translateRpcValidationIssues({ data }).find(candidate => candidate.message.trim().length > 0)
      if (issue) return issue.message
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
