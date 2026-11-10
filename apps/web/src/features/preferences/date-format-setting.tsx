import { useId } from "react"
import { useTranslation } from "react-i18next"

import { AppDate } from "@/components/app-date"
import { NativeSelect } from "@/components/ui/form-controls"
import { DATE_FORMATS } from "@/lib/date-format"
import { setDateFormat, useDateFormat } from "./date-format-preference"

/** Local display preference. Native date controls still use the browser's own presentation. */
export function DateFormatSetting() {
  const { t } = useTranslation()
  const id = useId()
  const order = useDateFormat()
  return (
    <div className="mt-5 border-t border-line pt-5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{t("settings.dateFormat.label")}</label>
      <p id={id + "-hint"} className="mt-2 text-sm text-muted-foreground">{t("settings.dateFormat.description")}</p>
      <NativeSelect id={id} value={order} aria-describedby={id + "-hint"} className="mt-3 min-h-11 w-full" onChange={(event) => setDateFormat(event.target.value)}>
        {DATE_FORMATS.map((format) => <option key={format} value={format}>{t("settings.dateFormat." + format)}</option>)}
      </NativeSelect>
      <p className="mt-3 text-sm text-foreground" aria-live="polite">
        <bdi dir="ltr">{order}</bdi>{" · "}{t("settings.dateFormat.example")} <AppDate value="2026-04-23" />
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t("settings.dateFormat.nativeInputs")}</p>
    </div>
  )
}
