import { useState, useRef, useEffect, useCallback } from "react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { ar } from "date-fns/locale/ar"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formInputClassName } from "@/components/ui/form-controls"

/**
 * Format a Date as DD/MM/YYYY for Arabic RTL display.
 */
function formatDateAr(date: Date): string {
  return format(date, "dd/MM/yyyy")
}

/**
 * Parse a DD/MM/YYYY string back to a Date.
 */
function parseDateAr(value: string): Date | undefined {
  if (!value) return undefined
  const date = parse(value, "dd/MM/yyyy", new Date())
  return isValid(date) ? date : undefined
}

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  name?: string
  id?: string
} & Pick<DayPickerProps, "mode">

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
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedDate = value ? parseDateAr(value) : undefined

  // Close on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open, handleClickOutside])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(formatDateAr(date))
    }
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={value} />}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
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
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="اختر تاريخاً"
          className="absolute z-50 mt-1 rounded-xl border border-line bg-bg shadow-lg animate-in fade-in-0 zoom-in-95"
          dir="ltr"
        >
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
              button_previous: "h-7 w-7 bg-transparent hover:bg-surface-2 rounded-lg flex items-center justify-center cursor-pointer transition-colors text-ink-3 hover:text-ink",
              button_next: "h-7 w-7 bg-transparent hover:bg-surface-2 rounded-lg flex items-center justify-center cursor-pointer transition-colors text-ink-3 hover:text-ink",
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
              chevron: "",
              footer: "",
              week_number: "",
              week_number_header: "",
              months_dropdown: "",
              years_dropdown: "",
            }}
          />
        </div>
      )}
    </div>
  )
}
