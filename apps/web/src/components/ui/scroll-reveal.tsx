import { type ReactNode, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface ScrollRevealProps {
  children: ReactNode
  /** Animation direction */
  direction?: "up" | "down" | "left" | "right" | "none"
  /** Delay in ms before animation starts */
  delay?: number
  /** Duration in ms */
  duration?: number
  /** Optional className */
  className?: string
}

const directionClasses = {
  up: "translate-y-4",
  down: "-translate-y-4",
  left: "translate-x-4 rtl:-translate-x-4",
  right: "-translate-x-4 rtl:translate-x-4",
  none: "",
}

/**
 * Scroll-triggered reveal animation using Intersection Observer.
 * Animates children into view when they enter the viewport.
 */
export function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  duration = 400,
  className,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(element)
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      },
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] ease-out",
        isVisible
          ? "opacity-100 translate-x-0 translate-y-0"
          : `opacity-0 ${directionClasses[direction]}`,
        className,
      )}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
