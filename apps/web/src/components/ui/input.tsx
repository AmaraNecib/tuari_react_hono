/**
 * Input component with consistent styling and RTL support.
 * Handles date inputs with Arabic locale formatting.
 */
import * as React from "react"

import { formInputClassName } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        formInputClassName,
        // Date inputs: force RTL layout + Arabic locale so the native calendar
        // renders day-first (DD/MM/YYYY) with Arabic month/day names.
        // NOTE: Chrome uses the *browser* language for the calendar popup.
        // The lang="ar" hint works in Firefox; Chrome users must set their
        // browser language to Arabic for full localized calendar display.
        type === "date" && "text-right [direction:rtl]",
        className,
      )}
      lang={type === "date" ? "ar" : undefined}
      dir={type === "date" ? "rtl" : undefined}
      type={type}
      {...props}
    />
  )
}

export { Input }
