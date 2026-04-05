import { DebtCreatePage as OriginalDebtCreatePage } from "@/features/debts/debt-create-page"

export function DebtCreatePageV1(props: any) {
  return (
    <div className="max-w-full px-0 py-0">
      <div className="rounded-none border-0 shadow-none bg-background p-8">
        <OriginalDebtCreatePage {...props} />
      </div>
    </div>
  )
}
