import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCopyClipboard } from "@/hooks/use-copy-clipboard"
import { CheckIcon, CopyIcon } from "lucide-react"

interface CopyButtonProps {
  /** Text to copy to clipboard */
  text: string
  /** Optional className */
  className?: string
  /** Button size variant */
  size?: "default" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
}

/**
 * Copy-to-clipboard button with visual feedback.
 * Shows a checkmark animation when copied.
 */
export function CopyButton({ text, className, size = "icon-sm" }: CopyButtonProps) {
  const { copied, copy } = useCopyClipboard()

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        "transition-all duration-150",
        copied && "text-green-600 dark:text-green-400",
        className,
      )}
      onClick={() => void copy(text)}
      aria-label={copied ? "Copied!" : "Copy to clipboard"}
    >
      <span className="relative size-4">
        <CopyIcon
          className={cn(
            "absolute inset-0 size-4 transition-all duration-200",
            copied ? "scale-0 opacity-0" : "scale-100 opacity-100",
          )}
        />
        <CheckIcon
          className={cn(
            "absolute inset-0 size-4 transition-all duration-200",
            copied ? "scale-100 opacity-100" : "scale-0 opacity-0",
          )}
        />
      </span>
    </Button>
  )
}
