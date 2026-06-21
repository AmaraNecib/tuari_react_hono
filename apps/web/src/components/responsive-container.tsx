import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { cn } from "@/lib/utils";

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  mobileClassName?: string;
  tabletClassName?: string;
  desktopClassName?: string;
}

export function ResponsiveContainer({
  children,
  className,
  mobileClassName,
  tabletClassName,
  desktopClassName,
}: ResponsiveContainerProps) {
  const { isMobile, isTablet, isDesktop } = useMobileLayout();

  const appliedClassName = cn(
    className,
    isMobile && mobileClassName,
    isTablet && tabletClassName,
    isDesktop && desktopClassName
  );

  return <div className={appliedClassName}>{children}</div>;
}

// Utility component for responsive grid layouts
export function ResponsiveGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ResponsiveContainer
      mobileClassName="grid gap-3 grid-cols-1"
      tabletClassName="grid gap-4 grid-cols-2"
      desktopClassName="grid gap-4 grid-cols-3 lg:grid-cols-4"
      className={className}
    >
      {children}
    </ResponsiveContainer>
  );
}

// Utility component for touch-friendly buttons
export function TouchButton({
  children,
  onClick,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-[48px] min-w-[48px] rounded-lg px-4 py-3 transition active:scale-95",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
