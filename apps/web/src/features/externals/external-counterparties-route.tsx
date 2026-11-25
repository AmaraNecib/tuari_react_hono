import { i18n as featureI18n } from "@/i18n"
import type { ExactDebtsClient, ExternalCounterparty } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { LoadErrorSurface } from "@/features/shared/load-error-surface"
import { useExactDebtSummary } from "@/features/debts/debts-exact-queries"
import { buildExternalCounterpartyRows } from "@/features/debts/debts-queries"

import { ExternalCounterpartiesPage } from "./externals-page"

export function ExternalCounterpartiesRoute({ client, counterparties, onCreate, onOpen }: {
  client: ExactDebtsClient
  counterparties: ExternalCounterparty[]
  onCreate: () => void
  onOpen: (counterpartyId: string) => void
}) {
  const { t } = useTranslation()
  const summary = useExactDebtSummary(client)

  if (summary.isPending) {
    return <LoadErrorSurface isLoading message={t("debts.loadError")} loadingLabel={featureI18n.t("featureCopy.externalCounterpartiesRoute.loading")} retryLabel={t("common.retry")} onRetry={() => void summary.refetch()} />
  }
  if (summary.isError) {
    return <LoadErrorSurface error={summary.error} attempt={summary.errorUpdatedAt} message={t("debts.loadError")} retryLabel={t("common.retry")} onRetry={() => void summary.refetch()} />
  }

  return <ExternalCounterpartiesPage
    counterparties={buildExternalCounterpartyRows(summary.data, counterparties)}
    onCreate={onCreate}
    onOpen={onOpen}
  />
}
