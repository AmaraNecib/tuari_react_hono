import { DebtCreatePage as OriginalDebtCreatePage } from "@/features/debts/debt-create-page"

export function DebtCreatePageV2(props: any) {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="rounded-sm border-2 border-black dark:border-white shadow-[4px_4px_0_0_rgba(0,0,0,1)] bg-background p-8">
        <OriginalDebtCreatePage {...props} />
      </div>
    </div>
  )
}
