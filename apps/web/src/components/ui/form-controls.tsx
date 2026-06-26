import { useTranslation } from "react-i18next"
import type { ComponentProps, ReactNode } from "react"

import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export const formControlClassName =
  "w-full rounded-xl border border-border/75 bg-background/82 px-4 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.48)_inset] outline-none transition-[color,background-color,border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus-visible:border-primary/45 focus-visible:ring-4 focus-visible:ring-primary/10 dark:bg-background dark:[color-scheme:dark] dark:shadow-none"

export const formInputClassName = cn(formControlClassName, "h-10")
export const formTextareaClassName = cn(formControlClassName, "min-h-24 py-3")

/** Styled native select with chevron icon. Wraps <select> with consistent form control styling. */
function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block w-full">
      <select
        className={cn(formInputClassName, "appearance-none pe-3.5 ps-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  )
}

/** Styled textarea with consistent form control styling. */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(formTextareaClassName, className)} {...props} />
}

function FieldSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="surface-card space-y-4 rounded-xl p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function CurrencyInput({
  className,
  currencyLabel,
  inputClassName,
  ...props
}: ComponentProps<"input"> & {
  currencyLabel?: string
  inputClassName?: string
}) {
  return (
    <span className={cn("flex w-full items-center gap-2 rounded-xl border border-border/75 bg-background/82 px-4 shadow-[0_1px_0_rgba(255,255,255,0.48)_inset] focus-within:border-primary/45 focus-within:ring-4 focus-within:ring-primary/10 dark:bg-background dark:shadow-none", className)}>
      <span className="shrink-0 text-sm font-medium text-muted-foreground" dir="rtl">
        {currencyLabel ?? "دج"}
      </span>
      <input
        className={cn("h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/80", inputClassName)}
        dir="ltr"
        inputMode="decimal"
        {...props}
      />
    </span>
  )
}


/** Styled file input with translated "No file chosen" / "Choose Files" text. */
function FileInput({ className, label, chooseLabel, ...props }: ComponentProps<"input"> & { label?: string; chooseLabel?: string }) {
  const { t } = useTranslation()
  const resolvedLabel = label ?? t("common.noFileChosen")
  const resolvedChooseLabel = chooseLabel ?? t("common.chooseFile")
  return (
    <span className={cn("relative block w-full", className)}>
      <input
        type="file"
        className="peer absolute inset-0 cursor-pointer opacity-0"
        {...props}
      />
      <span className={cn(formInputClassName, "flex items-center gap-2 pointer-events-none")}>
        <span className="truncate text-muted-foreground">
          {props.multiple ? resolvedLabel : resolvedLabel}
        </span>
        <span className="ms-auto text-primary text-xs font-medium">{resolvedChooseLabel}</span>
      </span>
    </span>
  )
}

export { CurrencyInput, FieldSection, FileInput, NativeSelect, Textarea }
