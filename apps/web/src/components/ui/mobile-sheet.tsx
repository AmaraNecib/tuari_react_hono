import type { ReactNode } from "react";
import { useMobileLayout } from "@/hooks/use-mobile-layout";

interface MobileSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function MobileSheet({
  isOpen,
  onOpenChange,
  title,
  children,
  actions,
}: MobileSheetProps) {
  const { isMobile } = useMobileLayout();

  // On desktop, render as nothing (parent should handle modal differently)
  if (!isMobile) {
    return null;
  }

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl border-t border-border/60 bg-background animate-in slide-in-from-bottom-5">
        {/* Handle */}
        <div className="flex items-center justify-center py-2">
          <div className="h-1 w-12 rounded-full bg-muted" />
        </div>

        {/* Header */}
        {title && (
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>

        {/* Actions */}
        {actions && (
          <div className="border-t border-border/60 px-4 py-3">
            {actions}
          </div>
        )}
      </div>
    </>
  );
}
