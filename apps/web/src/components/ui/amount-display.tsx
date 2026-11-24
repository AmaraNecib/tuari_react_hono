import type { ComponentProps } from "react"
import { MoneyValue } from "@/features/shared/money-value"

type Props = Omit<Extract<ComponentProps<typeof MoneyValue>, { exact: true }>, "exact"> & { exact?: true }
/** Exact strings only. Color follows the signed amount, never a floating-point conversion. */
export function AmountDisplay(props: Props) {
  const sign = /^-?0(?:\.0+)?$/.test(props.value) ? 0 : props.value.startsWith("-") ? -1 : 1
  return <MoneyValue {...props} exact toneClassName={props.toneClassName ?? (props.signed ? sign > 0 ? "text-good" : sign < 0 ? "text-bad" : undefined : undefined)} />
}
