import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

interface SuccessCheckmarkProps {
  /** Size of the checkmark */
  size?: "sm" | "md" | "lg"
  /** Optional className */
  className?: string
}

const sizeClasses = {
  sm: "size-8",
  md: "size-12",
  lg: "size-16",
}

const iconSizeClasses = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
}

/**
 * Animated success checkmark with flourish effect.
 * Use for confirming successful actions.
 */
export function SuccessCheckmark({ size = "md", className }: SuccessCheckmarkProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30",
        sizeClasses[size],
        className,
      )}
    >
      {/* Ripple effect */}
      <div className="absolute inset-0 rounded-full animate-ping bg-green-200/50 dark:bg-green-800/30" />

      {/* Checkmark icon */}
      <CheckIcon
        className={cn(
          "relative text-green-600 dark:text-green-400",
          iconSizeClasses[size],
          "animate-in zoom-in-50 duration-300 delay-150",
        )}
      />
    </div>
  )
}
