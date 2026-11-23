import { useTranslation } from "react-i18next"

import { useDateFormat } from "@/features/preferences/date-format-preference"
import { formatAlgeriaDate, formatTimeInAlgeria } from "@/lib/algeria-time"

type AppDateProps = {
  value: string | Date
  includeTime?: boolean
  timeStyle?: "short" | "medium"
  locale?: string
}

/** Isolate the date and clock separately so surrounding prose cannot reorder either run. */
export function AppDate({ value, includeTime = false, timeStyle = "short", locale }: AppDateProps) {
  const order = useDateFormat()
  const { i18n } = useTranslation()
  const resolvedLocale = locale ?? i18n?.language ?? "ar-DZ"
  const date = typeof value === "string" ? new Date(value) : value
  const label = formatAlgeriaDate(value, resolvedLocale, order)
  if (label === "—") return <>—</>
  return (
    <>
      <bdi dir="ltr" className="whitespace-nowrap tabular-nums">{label}</bdi>
      {includeTime && <> <bdi dir="auto" className="whitespace-nowrap tabular-nums">{formatTimeInAlgeria(date, resolvedLocale, timeStyle)}</bdi></>}
    </>
  )
}
