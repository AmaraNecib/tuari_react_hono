/**
 * External counterparty details page.
 */
import type { ExactDebtsClient, ExternalCounterparty } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { RecordInfoCard, RecordInfoGrid, RecordPageFrame } from "@/features/shared/record-page-frame"

import { ExactDebtsPage } from "@/features/debts/debts-exact-page"
import { type ManualSettlementClient } from "@/features/debts/manual-settlement-panel"

/**
 * @description Component
 */
export function ExternalCounterpartyDetailsPage({
  counterparty,
  debtClient,
  manualSettlementClient,
}: {
  counterparty: ExternalCounterparty & { phone?: string }
  debtClient: ExactDebtsClient
  manualSettlementClient?: ManualSettlementClient
}) {
  const { t } = useTranslation()
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

      <ExactDebtsPage manualSettlementClient={manualSettlementClient} client={debtClient} scopedParty={{ id: counterparty.id, label: counterparty.fullName, partyType: "EXTERNAL_COUNTERPARTY" }} parties={[{ id: counterparty.id, label: counterparty.fullName, partyType: "EXTERNAL_COUNTERPARTY" }]} />
    </RecordPageFrame>
  )
}
