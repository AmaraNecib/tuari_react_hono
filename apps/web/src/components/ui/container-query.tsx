import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ContainerQueryProps {
  children: ReactNode
  className?: string
  /** Minimum width for the container */
  minWidth?: string
  /** Maximum width for the container */
  maxWidth?: string
}

/**
 * Container that uses CSS Container Queries for component-level adaptation.
 * Children can use @container queries to adapt based on container width.
 */
export function ContainerQuery({
  children,
  className,
  minWidth = "200px",
  maxWidth = "100%",
}: ContainerQueryProps) {
  return (
    <div
      className={cn("container-responsive", className)}
      style={{
        containerType: "inline-size",
        minWidth,
        maxWidth,
      }}
    >
      {children}
    </div>
  )
}

interface ContainerQueryBlockProps {
  children: ReactNode
  className?: string
}

/**
 * Block that adapts based on container width.
 * Uses CSS Container Queries internally.
 */
export function ContainerQueryBlock({ children, className }: ContainerQueryBlockProps) {
  return (
    <div className={cn("container-responsive", className)} style={{ containerType: "inline-size" }}>
      {children}
    </div>
  )
}
