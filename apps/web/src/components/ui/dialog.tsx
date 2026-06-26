import { createPortal } from "react-dom"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>,
    document.body,
  )
}

export function DialogContent({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative z-10 w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-lg",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-4 space-y-1.5", className)}>{children}</div>
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("mt-6 flex flex-wrap-reverse items-center justify-end gap-2", className)}>
      {children}
    </div>
  )
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)}>{children}</h2>
}

export function DialogDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
}
