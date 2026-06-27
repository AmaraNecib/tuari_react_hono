/**
 * Debt party summary card component.
 * Displays summary information for a debt party.
 */
import { useTranslation } from "react-i18next"
import type { DebtAccount } from "@tuari/contracts"
import { Surface } from "@/features/shared/page-primitives"
import { formatDebtMoney, getCombinedDebtBalance, getDebtBalanceMeta } from "./debt-utils"
import { cn } from "@/lib/utils"

export function DebtPartySummaryCard({ accounts, personName }: { accounts: DebtAccount[]; personName: string }) {
  const { t } = useTranslation()
  const combinedBalance = getCombinedDebtBalance(accounts)
  const balanceMeta = getDebtBalanceMeta(combinedBalance)
  const openCount = accounts.filter((a) => a.status === "OPEN").length
  const settledCount = accounts.filter((a) => a.status === "SETTLED").length

  return (
    <Surface className="rounded-xl p-5" variant="card">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{t("detailPages.debt.partySummaryCard.balanceLabel", { personName })}</p>
          <p className={cn("mt-2 font-mono text-3xl font-bold", balanceMeta.textClassName)} dir="ltr">
            {t("detailPages.debt.currency")} {formatDebtMoney(combinedBalance)}
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("detailPages.debt.partySummaryCard.openCases")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{openCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("detailPages.debt.partySummaryCard.closedCases")}</p>
            <p className="mt-1 text-lg font-semibold text-muted-foreground">{settledCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border px-3 py-1 w-fit">
          <span className={cn("rounded-full w-2 h-2", balanceMeta.badgeClassName?.split(" ")[1]?.match(/text-\w+/) ? "bg-current" : "")}></span>
          <span className={cn("text-xs font-medium", balanceMeta.textClassName)}>{balanceMeta.description}</span>
        </div>
      </div>
    </Surface>
  )
}
