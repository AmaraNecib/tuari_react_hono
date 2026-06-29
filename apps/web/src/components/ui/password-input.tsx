import { useId, useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  hideLabel: string
  showLabel: string
}

/** Password input with show/hide toggle. */
/**
 * @description Component
 */
export function PasswordInput({ hideLabel, showLabel, id, className, dir, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const inputId = id ?? useId()

  return (
    <div className="relative flex items-center">
      <Input
        id={inputId}
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        {...props}
        className={cn("pe-11", className)}
        dir={dir ?? "rtl"}
      />
      <Button
        aria-controls={inputId}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute end-2 z-10 flex items-center justify-center p-0 size-4"
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => setVisible((current) => !current)}
      >
        <EyeOff className={cn("size-4 transition-transform", visible ? "scale-100" : "scale-0 absolute")} />
        <Eye className={cn("size-4 transition-transform", visible ? "scale-0 absolute" : "scale-100")} />
      </Button>
    </div>
  )
}
