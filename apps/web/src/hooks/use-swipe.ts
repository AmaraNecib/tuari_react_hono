import { useCallback, useRef } from "react"

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/**
 * Hook for detecting swipe gestures on touch devices.
 * Returns event handlers to attach to the target element.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
}: UseSwipeOptions = {}): SwipeHandlers {
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (touch) {
      touchStart.current = { x: touch.clientX, y: touch.clientY }
    }
  }, [])

  const onTouchMove = useCallback(() => {
    // No-op, we just need the start position
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return

      const touch = e.changedTouches[0]
      if (!touch) return

      const startX = touchStart.current.x
      const startY = touchStart.current.y
      const endX = touch.clientX
      const endY = touch.clientY

      touchStart.current = null

      const deltaX = endX - startX
      const deltaY = endY - startY

      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)

      if (absDeltaX < threshold && absDeltaY < threshold) {
        return // Swipe was too short
      }

      if (absDeltaX > absDeltaY) {
        // Horizontal swipe
        if (deltaX > 0) {
          onSwipeRight?.()
        } else {
          onSwipeLeft?.()
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          onSwipeDown?.()
        } else {
          onSwipeUp?.()
        }
      }
    },
    [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold],
  )

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
