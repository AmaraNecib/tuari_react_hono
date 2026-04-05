import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

export function DesignSwitcher({ currentVersion, currentEntity }: { currentVersion: 1 | 2 | 3 | 4, currentEntity: "debts" | "debt-create" | "employees" }) {
  const versions = [1, 2, 3, 4]
  return (
    <div className="flex gap-2 p-3 bg-muted/40 rounded-xl mb-6 items-center flex-wrap" dir="rtl">
      <p className="text-xs font-bold uppercase text-muted-foreground mr-auto">تجربة التصميم (Design Variants)</p>
      <div className="flex gap-2">
        {versions.map(v => {
          let path = ""
          if (currentEntity === "debts") path = `/debts/v${v}`
          else if (currentEntity === "debt-create") path = `/debts/v${v}/create`
          else if (currentEntity === "employees") path = `/employees/v${v}`
          return (
            <Link 
              key={v} 
              to={path}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border",
                currentVersion === v 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
            >
              V{v}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
