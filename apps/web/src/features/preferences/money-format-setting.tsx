import { useTranslation } from "react-i18next"

import { Field } from "@/components/ui/field"
import { NativeSelect } from "@/components/ui/form-controls"
import { setMoneyGrouping, useMoneyGrouping } from "./money-format-preference"

/** Applies immediately on this device, without changing decimal entry or storage. */
export function MoneyFormatSetting() {
  const { t } = useTranslation()
  const grouped = useMoneyGrouping()
  return (
    <div className="mt-5 border-t border-line pt-5">
      <Field label={t("settings.moneyFormat.label")} hint={t("settings.moneyFormat.description")}>
        <NativeSelect value={grouped ? "grouped" : "plain"} onChange={(event) => setMoneyGrouping(event.target.value === "grouped")}>
          <option value="grouped">{t("settings.moneyFormat.grouped")}</option>
          <option value="plain">{t("settings.moneyFormat.plain")}</option>
        </NativeSelect>
      </Field>
      <p className="mt-2 font-mono tabular-nums text-foreground" dir="ltr" aria-live="polite">
        {grouped ? "1,234.56 / 1,234" : "1234.56 / 1234"}
      </p>
    </div>
  )
}
