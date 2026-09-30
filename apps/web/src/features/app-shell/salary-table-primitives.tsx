import { useTranslation } from "react-i18next"

import { Field } from "@/components/ui/field"
import { NativeSelect } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import type { SalaryPeriodType } from "@tuari/contracts"

/** The three period values the period filter can select, in display order. */
export const SALARY_PERIOD_FILTER_VALUES: SalaryPeriodType[] = ["DAILY", "WEEKLY", "MONTHLY"]

/** The period filter's value: a concrete period, or the "all periods" default. */
export type SalaryPeriodFilterValue = "ALL" | SalaryPeriodType

/**
 * The i18n key for a salary period, with the shared "unknown means a month"
 * default. Both salary tables render the same period vocabulary, so it is
 * stated once here rather than copied per table.
 */
export function getSalaryPeriodLabelKey(value: SalaryPeriodType | null): string {
  if (value === "DAILY") return "detailPages.salary.daily"
  if (value === "WEEKLY") return "detailPages.salary.weekly"
  if (value === "MONTHLY") return "detailPages.salary.monthly"
  return "detailPages.salary.notSpecified"
}

/** Projects in the alphabetical order the filter options use. */
export function sortProjectsByName<T extends { name: string }>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, "ar"))
}

/**
 * A money amount in the table's DZD presentation: Latin digits and grouping,
 * rendered LTR inside the RTL page so the number reads correctly. Split shares
 * pass `maximumFractionDigits={2}` so their sum reconciles with the paid amount.
 */
export function MoneyCell({
  value,
  currencyLabel,
  maximumFractionDigits = 0,
}: {
  value: number
  currencyLabel: string
  /** Split shares carry cents so their sum reconciles with the paid amount. */
  maximumFractionDigits?: number
}) {
  return (
    <span className="font-mono tabular-nums text-ink" dir="ltr">
      {currencyLabel}{" "}
      {new Intl.NumberFormat("en-US", { maximumFractionDigits, useGrouping: true }).format(value)}
    </span>
  )
}

/** Search field shared by both salary tables. */
export function SalarySearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Field className="min-w-[14rem] flex-1" label={t("salaries.searchPlaceholder")}>
      <Input
        value={value}
        placeholder={t("salaries.searchPlaceholder")}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

/** Project filter shared by both salary tables. */
export function SalaryProjectFilterField({
  value,
  options,
  onChange,
}: {
  value: string
  options: Array<{ id: string; name: string }>
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Field label={t("salaries.projectFilter")}>
      <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="ALL">{t("salaries.allProjects")}</option>
        {options.map((project) => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </NativeSelect>
    </Field>
  )
}

/** Period filter shared by both salary tables. */
export function SalaryPeriodFilterField({
  value,
  onChange,
}: {
  value: SalaryPeriodFilterValue
  onChange: (value: SalaryPeriodFilterValue) => void
}) {
  const { t } = useTranslation()

  return (
    <Field label={t("salaries.periodFilter")}>
      <NativeSelect
        value={value}
        onChange={(event) => onChange(event.target.value as SalaryPeriodFilterValue)}
      >
        <option value="ALL">{t("salaries.allPeriods")}</option>
        {SALARY_PERIOD_FILTER_VALUES.map((period) => (
          <option key={period} value={period}>{t(getSalaryPeriodLabelKey(period))}</option>
        ))}
      </NativeSelect>
    </Field>
  )
}
