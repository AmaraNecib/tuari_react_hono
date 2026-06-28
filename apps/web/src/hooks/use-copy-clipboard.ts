import { useCallback, useState } from "react"

interface UseCopyClipboardOptions {
  /** Duration in ms to show the copied state */
  copiedDuration?: number
}

interface UseCopyClipboardReturn {
  /** Whether the content was recently copied */
  copied: boolean
  /** Copy content to clipboard */
  copy: (text: string) => Promise<void>
}

/**
 * Hook for copy-to-clipboard with visual feedback.
 * Shows a "copied" state for a configurable duration.
 */
export function useCopyClipboard({
  copiedDuration = 2000,
}: UseCopyClipboardOptions = {}): UseCopyClipboardReturn {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), copiedDuration)
      } catch (error) {
        console.error("Failed to copy:", error)
      }
    },
    [copiedDuration],
  )

  return { copied, copy }
}
