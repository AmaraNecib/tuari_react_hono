import { useState } from "react"
import { DayPicker } from "react-day-picker"
import { ar } from "date-fns/locale/ar"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formInputClassName } from "@/components/ui/form-controls"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const DISPLAY_DATE_FORMAT = "dd/MM/yyyy"
const CANONICAL_DAY_FORMAT = "yyyy-MM-dd"

const CANONICAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DISPLAY_DAY_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/

/**
 * Format a Date as DD/MM/YYYY for Arabic RTL display.
 */
function formatDateAr(date: Date): string {
  return format(date, DISPLAY_DATE_FORMAT)
}

/**
 * Parse a picker value into a Date.
 *
 * The app's canonical day is `yyyy-MM-dd` (what `getAlgeriaDateInputValue`
 * produces and `toAlgeriaDayBoundaryIso` consumes), so that is the contract.
 * The `dd/MM/yyyy` display format is still accepted defensively and normalized
 * to the same day, so a stray caller cannot silently blank the field.
 */
function parsePickerValue(value: string): Date | undefined {
  if (!value) return undefined
  const pattern = CANONICAL_DAY_PATTERN.test(value)
    ? CANONICAL_DAY_FORMAT
    : DISPLAY_DAY_PATTERN.test(value)
      ? DISPLAY_DATE_FORMAT
      : null
  if (!pattern) return undefined
  const date = parse(value, pattern, new Date())
  return isValid(date) ? date : undefined
}

/**
 * The canonical `yyyy-MM-dd` day the app stores, sends to the API and feeds to
 * `toAlgeriaDayBoundaryIso`. The picker always reports this format.
 */
function toCanonicalDay(date: Date): string {
  return format(date, CANONICAL_DAY_FORMAT)
}

type DatePickerProps = {
  /** The app's canonical `yyyy-MM-dd` day (a `dd/MM/yyyy` string is normalized). */
  value: string
  /** Receives the picked day as canonical `yyyy-MM-dd`. */
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  name?: string
  id?: string
}

/**
 * Date picker with Arabic locale support. Displays `dd/MM/yyyy`; its value
 * contract is the app's canonical `yyyy-MM-dd` day in and out.
 */
/**
 * @description Component
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  disabled = false,
  className,
  name,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selectedDate = value ? parsePickerValue(value) : undefined

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(toCanonicalDay(date))
    }
    setOpen(false)
  }

  return (
    <div className={cn("relative", className)}>
      {/* Hidden input for form submission */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedDate ? toCanonicalDay(selectedDate) : ""}
        />
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          className={cn(
            formInputClassName,
            "h-10 flex items-center justify-between gap-2 cursor-pointer text-start",
            "focus-visible:border-primary/45 focus-visible:ring-4 focus-visible:ring-primary/10",
            disabled && "cursor-not-allowed opacity-70",
          )}
        >
          <span className={cn(!selectedDate && "text-muted-foreground/80")}>
            {selectedDate ? formatDateAr(selectedDate) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>

        <PopoverContent align="start" side="bottom" sideOffset={4} className="w-auto p-0">
          <div dir="ltr">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              locale={ar}
              defaultMonth={selectedDate}
              showOutsideDays
              classNames={{
                root: "p-3",
                months: "flex flex-col sm:flex-row gap-2",
                month: "flex flex-col",
                month_caption: "flex justify-center items-center h-9 font-medium text-sm text-foreground",
                caption_label: "font-medium text-sm",
                nav: "flex items-center gap-1 absolute top-3",
                button_previous: "h-7 w-7 bg-transparent hover:bg-surface-2 rounded-lg flex items-center justify-center cursor-pointer transition-colors text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-3",
                button_next: "h-7 w-7 bg-transparent hover:bg-surface-2 rounded-lg flex items-center justify-center cursor-pointer transition-colors text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-3",
                dropdowns: "flex gap-2",
                dropdown: "rounded-lg border border-border bg-background px-2 py-1 text-sm",
                dropdown_root: "relative",
                month_grid: "w-full border-collapse mt-1",
                weekdays: "flex",
                weekday: "w-9 h-9 text-[0.6875rem] font-medium text-muted-foreground flex items-center justify-center",
                week: "flex w-full",
                weeks: "",
                day: "w-9 h-9 text-sm flex items-center justify-center rounded-lg hover:bg-surface-2 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1",
                day_button: "w-full h-full flex items-center justify-center rounded-lg",
                selected: "bg-primary text-primary-foreground hover:bg-primary/90",
                today: "font-semibold text-primary",
                outside: "text-muted-foreground/40",
                disabled: "text-muted-foreground/30 cursor-not-allowed",
                hidden: "invisible",
                focused: "",
                range_start: "",
                range_middle: "",
                range_end: "",
                weeks_before_enter: "",
                weeks_before_exit: "",
                weeks_after_enter: "",
                weeks_after_exit: "",
                caption_after_enter: "",
                caption_after_exit: "",
                caption_before_enter: "",
                caption_before_exit: "",
                chevron: "size-4 fill-current",
                footer: "",
                week_number: "",
                week_number_header: "",
                months_dropdown: "",
                years_dropdown: "",
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
