/**
 * Formatting utilities for home view data.
 * Provides helper functions for formatting names, dates, etc.
 */
import type { DemoWorkspace } from "./workspace-queries"

export function formatName(employee: DemoWorkspace["employees"][number]) {
  return `${employee.firstName} ${employee.lastName}`
}

export function formatDateLabel(value: string | null) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function formatDateRange(startDate: string | null, endDate: string | null, ongoingLabel: string) {
  return `${formatDateLabel(startDate)} - ${endDate ? formatDateLabel(endDate) : ongoingLabel}`
}

export function formatSalaryPeriodLabel(
  value: "DAILY" | "WEEKLY" | "MONTHLY" | null,
  labels: { daily: string; monthly: string; weekly: string },
) {
  if (value === "DAILY") {
    return labels.daily
  }

  if (value === "WEEKLY") {
    return labels.weekly
  }

  if (value === "MONTHLY") {
    return labels.monthly
  }

  return null
}
