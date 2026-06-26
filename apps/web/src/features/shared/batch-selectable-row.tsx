import type { ReactNode } from "react";

interface BatchSelectableRowProps {
  id: string;
  isSelected: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
  className?: string;
}

/** Table row with batch selection checkbox. */
export function BatchSelectableRow({
  id,
  isSelected,
  onToggle,
  children,
  className,
}: BatchSelectableRowProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-border/60 p-4 transition ${
        isSelected ? "bg-muted/30" : "bg-surface"
      } ${className || ""}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(id)}
        className="mt-1 h-4 w-4 cursor-pointer"
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
