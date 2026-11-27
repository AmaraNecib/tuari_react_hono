/**
 * External counterparty details page.
 */
import type { ExactDebtsClient, ExternalCounterparty } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { RecordInfoCard, RecordInfoGrid, RecordPageFrame } from "@/features/shared/record-page-frame"

import { useCompositeWorkspaceQuery } from "@/features/app-shell/workspace-queries"
import { ExactDebtsPage } from "@/features/debts/debts-exact-page"
import { type ManualSettlementClient } from "@/features/debts/manual-settlement-panel"
import { selectSettlementClient, type ExperimentalInvoicesClient, type ExperimentalSettlementClient } from "@/features/debts/settlement-client"

/**
 * @description Component
 */
export function ExternalCounterpartyDetailsPage({
  counterparty,
  debtClient,
  manualSettlementClient,
  experimentalSettlementClient,
  experimentalInvoicesClient,
}: {
  counterparty: ExternalCounterparty & { phone?: string }
  debtClient: ExactDebtsClient
  manualSettlementClient?: ManualSettlementClient
  experimentalSettlementClient?: ExperimentalSettlementClient
  experimentalInvoicesClient?: ExperimentalInvoicesClient
}) {
  const { t } = useTranslation()
  const metadata = useCompositeWorkspaceQuery({ enabled: Boolean(manualSettlementClient || experimentalSettlementClient || experimentalInvoicesClient) })
  const settlementClient = selectSettlementClient({
    resolved: metadata.isSuccess && !metadata.isFetching && !metadata.isError,
    capabilities: metadata.data?.capabilities,
    manualClient: manualSettlementClient,
    experimentalClient: experimentalSettlementClient,
    experimentalInvoicesClient,
  })
  return (
    <RecordPageFrame
      backHref="/externals"
      backLabel={t("externals.details.back")}
      title={counterparty.fullName}
      description={t("externals.details.description")}
    >
      <RecordInfoGrid>
        <RecordInfoCard label={t("externals.details.name")} value={counterparty.fullName} />
        <RecordInfoCard label={t("externals.details.phoneNumber")} value={counterparty.phone ?? counterparty.phoneNumber} valueClassName="font-mono" />
        <RecordInfoCard label={t("externals.details.notes")} value={counterparty.note?.trim() || t("common.noNotes")} />
      </RecordInfoGrid>

      <ExactDebtsPage settlementClient={settlementClient} client={debtClient} scopedParty={{ id: counterparty.id, label: counterparty.fullName, partyType: "EXTERNAL_COUNTERPARTY" }} parties={[{ id: counterparty.id, label: counterparty.fullName, partyType: "EXTERNAL_COUNTERPARTY" }]} />
    </RecordPageFrame>
  )
}
