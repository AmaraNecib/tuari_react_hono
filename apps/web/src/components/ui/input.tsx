import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-2xl border border-border/80 bg-white/75 px-4 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.65)_inset] outline-none transition placeholder:text-muted-foreground/80 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 dark:bg-white/6 dark:shadow-none",
        className,
      )}
      type={type}
      {...props}
    />
  )
}

export { Input }
