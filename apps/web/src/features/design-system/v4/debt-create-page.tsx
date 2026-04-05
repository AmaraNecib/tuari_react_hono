import { DebtCreatePage as OriginalDebtCreatePage } from "@/features/debts/debt-create-page"

export function DebtCreatePageV4(props: any) {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="rounded-xl border border-border/40 shadow-sm bg-card transition-all hover:shadow-md p-8">
        <OriginalDebtCreatePage {...props} />
      </div>
    </div>
  )
}
