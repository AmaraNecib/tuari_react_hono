/**
 * External counterparty details page.
 */
import type { DebtAccount, DebtEntry, ExternalCounterparty } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { RecordInfoCard, RecordInfoGrid, RecordPageFrame } from "@/features/shared/record-page-frame"

import { DebtCasesPanel } from "@/features/debts/debt-cases-panel"

/**
 * @description Component
 */
export function ExternalCounterpartyDetailsPage({
  counterparty,
  debtAccounts,
  debtEntriesByAccountId,
}: {
  counterparty: ExternalCounterparty & { phone?: string }
  debtAccounts: DebtAccount[]
  debtEntriesByAccountId: Record<string, DebtEntry[]>
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

      <DebtCasesPanel
        accounts={debtAccounts}
        debtEntriesByAccountId={debtEntriesByAccountId}
        externalCounterpartyId={counterparty.id}
        title={t("externals.details.ledger")}
      />
    </RecordPageFrame>
  )
}
