import { useId, useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  hideLabel: string
  showLabel: string
}

export function PasswordInput({ hideLabel, showLabel, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()

  return (
    <div className="relative">
      <Input
        id={inputId}
        type={visible ? "text" : "password"}
        {...props}
        className={cn("pl-11 text-right", props.className)}
        dir={props.dir ?? "rtl"}
      />
      <Button
        aria-controls={inputId}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute inset-y-1/2 left-2 z-10 size-8 -translate-y-1/2 active:translate-y-0 active:transition-none"
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff key="hide" className="size-4" /> : <Eye key="show" className="size-4" />}
      </Button>
    </div>
  )
}
