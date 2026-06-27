import type { DebtAccount, DebtEntry, ExternalCounterparty } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { RecordInfoCard, RecordInfoGrid, RecordPageFrame } from "@/features/shared/record-page-frame"

import { DebtCasesPanel } from "@/features/debts/debt-cases-panel"

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
      backLabel={t("externals.details.back", "العودة إلى الأطراف الخارجية")}
      title={counterparty.fullName}
      description={t("externals.details.description", "يعرض الملف رصيد الدين الحالي لهذا الطرف مع سجل كامل للحركات على الحساب الموحد.")}
    >
      <RecordInfoGrid>
        <RecordInfoCard label={t("externals.details.name", "الاسم")} value={counterparty.fullName} />
        <RecordInfoCard label={t("externals.details.phoneNumber", "رقم الهاتف")} value={counterparty.phone ?? counterparty.phoneNumber} valueClassName="font-mono" />
        <RecordInfoCard label={t("externals.details.notes", "ملاحظات")} value={counterparty.note?.trim() || t("common.noNotes", "لا توجد ملاحظات.")} />
      </RecordInfoGrid>

      <DebtCasesPanel
        accounts={debtAccounts}
        debtEntriesByAccountId={debtEntriesByAccountId}
        externalCounterpartyId={counterparty.id}
        title={t("externals.details.ledger", "دفتر الدين")}
      />
    </RecordPageFrame>
  )
}
