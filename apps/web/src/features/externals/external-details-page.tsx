import type { DebtAccount, DebtEntry, ExternalCounterparty } from "@tuari/contracts"

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
  return (
    <RecordPageFrame
      backHref="/externals"
      backLabel="العودة إلى الأطراف الخارجية"
      title={counterparty.fullName}
      description="يعرض الملف رصيد الدين الحالي لهذا الطرف مع سجل كامل للحركات على الحساب الموحد."
    >
      <RecordInfoGrid>
        <RecordInfoCard label="الاسم" value={counterparty.fullName} />
        <RecordInfoCard label="رقم الهاتف" value={counterparty.phone ?? counterparty.phoneNumber} valueClassName="font-mono" />
        <RecordInfoCard label="ملاحظات" value={counterparty.note?.trim() || "لا توجد ملاحظات."} />
      </RecordInfoGrid>

      <DebtCasesPanel
        accounts={debtAccounts}
        debtEntriesByAccountId={debtEntriesByAccountId}
        externalCounterpartyId={counterparty.id}
        title="دفتر الدين"
      />
    </RecordPageFrame>
  )
}
