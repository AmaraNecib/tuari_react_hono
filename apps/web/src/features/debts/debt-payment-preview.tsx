import { CurrencyRun } from "@/features/shared/money-value"
import type { DebtAccount } from "@tuari/contracts"
import { useTranslation } from "react-i18next"
import type { resolveDebtPaymentAction } from "./debt-payment"
import { formatDebtAmount, getDebtAccountBalanceDisplay } from "./debt-utils"

export function DebtPaymentPreview({ action, direction }: {
  action: NonNullable<ReturnType<typeof resolveDebtPaymentAction>>
  direction: DebtAccount["direction"]
}) {
  const { t } = useTranslation()
  const remaining = getDebtAccountBalanceDisplay({ direction, currentBalance: action.balanceAfterDzd })
  return (
    <dl aria-label={t("debts.payment.preview")} aria-live="polite" className="space-y-1 text-sm">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <dt>{t("debts.payment.amount")}</dt>
        <dd className="font-mono"><CurrencyRun amount={formatDebtAmount(action.amountDzd)} currencyLabel={t("detailPages.debt.currency")} /></dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <dt>{t("debts.payment.balanceAfter")}</dt>
        <dd>{remaining.phrase} <CurrencyRun amount={formatDebtAmount(remaining.amount)} currencyLabel={t("detailPages.debt.currency")} className="font-mono" /></dd>
      </div>
    </dl>
  )
}
