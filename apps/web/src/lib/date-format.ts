/** Numeric display order only. Canonical inputs, instants and ranges never use this preference. */
export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "YYYY/DD/MM"] as const
export type DateFormat = typeof DATE_FORMATS[number]
export const DEFAULT_DATE_FORMAT: DateFormat = "DD/MM/YYYY"

export function resolveDateFormat(value: unknown): DateFormat {
  return DATE_FORMATS.find((format) => format === value) ?? DEFAULT_DATE_FORMAT
}
