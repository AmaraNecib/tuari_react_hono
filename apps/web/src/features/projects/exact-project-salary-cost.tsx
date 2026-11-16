import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { exactProjectSalaryCostSchema, type ExactWorkforceEarningsClient } from "@tuari/contracts"
import { MoneyValue } from "@/features/shared/money-value"

export function ExactProjectSalaryCost({ projectId, client }: { projectId: string; client: ExactWorkforceEarningsClient }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ["application", "project-salary-cost", projectId], queryFn: async () => exactProjectSalaryCostSchema.parse(await client.getProjectSalaryCost({ projectId })) })
  if (query.isPending) return <p role="status">{t("common.loading")}</p>
  if (query.isError) return <p role="alert">{t("salaryEarnings.projectError")}</p>
  return <section className="space-y-3"><h2 className="text-lg font-semibold">{t("detailPages.project.cost.tab")}</h2><p>{t("salaryEarnings.projectCost")}: <MoneyValue exact aggregate value={query.data.totalAmount} currencyLabel={t("common.currency")} /></p></section>
}
