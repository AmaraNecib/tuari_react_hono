import { cn } from "@/lib/utils"
export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "good" | "bad" | "neutral" }) {
  return <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs", tone === "good" ? "border-good/30 text-good" : tone === "bad" ? "border-bad/30 text-bad" : "border-border text-muted-foreground")}>{label}</span>
}
