import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface LabeledIconProps {
  /** Icon component */
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** Label text */
  label: string
  /** Icon size */
  size?: number
  /** Layout direction */
  direction?: "horizontal" | "vertical"
  /** Additional className */
  className?: string
  /** Whether to always show label (not just on hover) */
  showLabel?: boolean
}

/**
 * Icon with label that shows on hover or always.
 * Used for icon-only navigation elements.
 */
/**
 * @description Component
 */
export function LabeledIcon({
  icon: Icon,
  label,
  size = 16,
  direction = "vertical",
  className,
  showLabel = false,
}: LabeledIconProps) {
  return (
    <div
      className={cn(
        "group/labeled-icon relative inline-flex items-center gap-2",
        direction === "vertical" && "flex-col",
        className,
      )}
    >
      <Icon size={size} />
      <span
        className={cn(
          "text-xs text-muted-foreground transition-opacity",
          showLabel ? "opacity-100" : "opacity-0 group-hover/labeled-icon:opacity-100 absolute",
          direction === "horizontal" && "whitespace-nowrap",
        )}
      >
        {label}
      </span>
    </div>
  )
}

interface SidebarNavItemProps {
  /** Icon component */
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** Label text */
  label: string
  /** Whether the item is active */
  isActive?: boolean
  /** Click handler */
  onClick?: () => void
  /** Additional className */
  className?: string
  /** Whether sidebar is collapsed */
  collapsed?: boolean
}

/**
 * Sidebar navigation item with icon and label.
 * Shows label only when sidebar is expanded.
 */
/**
 * @description Component
 */
export function SidebarNavItem({
  icon: Icon,
  label,
  isActive,
  onClick,
  className,
  collapsed,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        collapsed && "justify-center px-0",
        className,
      )}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

interface IconButtonWithLabelProps {
  /** Icon component */
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** Label text (shown as tooltip and sr-only) */
  label: string
  /** Click handler */
  onClick?: () => void
  /** Button variant */
  variant?: "ghost" | "outline" | "default"
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg"
  /** Additional className */
  className?: string
  /** Children */
  children?: ReactNode
}

/**
 * Icon button with accessible label and tooltip.
 */
/**
 * @description Component
 */
export function IconButtonWithLabel({
  icon: Icon,
  label,
  onClick,
  variant = "ghost",
  size = "icon-sm",
  className,
  children,
}: IconButtonWithLabelProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors",
        variant === "ghost" && "hover:bg-surface-2",
        variant === "outline" && "border border-line hover:bg-surface-2",
        variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
        size === "icon" && "h-10 w-10",
        size === "icon-sm" && "h-8 w-8",
        size === "icon-lg" && "h-12 w-12",
        className,
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children ?? <Icon size={size === "icon-lg" ? 20 : 16} />}
    </button>
  )
}
