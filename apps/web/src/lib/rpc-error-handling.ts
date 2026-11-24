import { i18n } from "@/i18n"

export type TranslatedRpcValidationIssue = {
  path: Array<string | number>
  field: string
  message: string
}

const RPC_VALIDATION_KEYS = new Set([
  "expenses.validation.amountPrecision",
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

/** Extracts explicit field validation only, never operational exception text. */
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


  return null
}

/** Uses explicit field feedback or the caller-owned safe fallback. */
export function buildErrorMessage(error: unknown, fallbackMessage: string): string {
  const extracted = extractRpcIssueMessage(error)
  if (extracted !== null) {
    return extracted
  }
  return fallbackMessage
}
