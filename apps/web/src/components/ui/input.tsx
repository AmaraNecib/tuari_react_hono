import * as React from "react"

import { formInputClassName } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        formInputClassName,
        className,
      )}
      type={type}
      {...props}
    />
  )
}

export { Input }
