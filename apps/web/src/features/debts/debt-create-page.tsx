import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { CreateableSelect } from "@/components/ui/createable-select"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { Field } from "@/components/ui/field"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { Surface } from "@/features/shared/page-primitives"
import { useCreateDebtAccountMutation, useCreateExternalCounterpartyMutation, useCreateEmployeesBatchMutation } from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"
import type { useHomeViewNavigation } from "@/features/app-shell/home-view-navigation"
import type { ExternalCounterparty } from "@tuari/contracts"

/**
 * Reason category → direction mapping.
 * Categories that lock direction show a fixed label;
 * OTHER and INVOICE_DRIVEN require the caller to choose.
 */
const DEBT_CATEGORIES: Array<{
  value: ReasonCategory
  labelAr: string
  labelEn: string
  impliedDirection: "PAYABLE" | "RECEIVABLE" | "UNCONSTRAINED"
  descriptionAr: string
  descriptionEn: string
}> = [
  {
    value: "SALARY_ADVANCE",
    labelAr: "سلفة راتب",
    labelEn: "Salary Advance",
    impliedDirection: "PAYABLE",
    descriptionAr: "صرفنا للعامل مال قبل استحقاقه",
    descriptionEn: "We gave the worker money before they earned it",
  },
  {
    value: "REIMBURSEMENT",
    labelAr: "تعويض مصاريف",
    labelEn: "Reimbursement",
    impliedDirection: "PAYABLE",
    descriptionAr: "العامل دفع شيء نيابة عنا (ماء، مواد، نقل)",
    descriptionEn: "Worker paid something on our behalf",
  },
  {
    value: "CASH_TAKE",
    labelAr: "أخذ كاش",
    labelEn: "Cash Take",
    impliedDirection: "RECEIVABLE",
    descriptionAr: "العامل أخذ كاش من الصندوق",
    descriptionEn: "Worker took cash from the till",
  },
  {
    value: "EQUIPMENT_DAMAGE",
    labelAr: "تلف معدات",
    labelEn: "Equipment Damage",
    impliedDirection: "RECEIVABLE",
    descriptionAr: "العامل مدين لنا بسبب تلف معدات",
    descriptionEn: "Worker owes us for damaged equipment",
  },
  {
    value: "PERSONAL_LOAN",
    labelAr: "قرض شخصي",
    labelEn: "Personal Loan",
    impliedDirection: "RECEIVABLE",
    descriptionAr: "أعطينا العامل قرض نقدي ليرجعه",
    descriptionEn: "We gave the worker a cash loan to be repaid",
  },
  {
    value: "DIRECT_LOAN_GIVEN",
    labelAr: "قرض مباشر (أعطينا)",
    labelEn: "Direct Loan (Given)",
    impliedDirection: "RECEIVABLE",
    descriptionAr: "أعطينا الطرف الخارجي قرض",
    descriptionEn: "We gave an external counterparty a loan",
  },
  {
    value: "DIRECT_LOAN_TAKEN",
    labelAr: "قرض مباشر (أخذنا)",
    labelEn: "Direct Loan (Taken)",
    impliedDirection: "PAYABLE",
    descriptionAr: "طرف خارجي أقرضنا مال",
    descriptionEn: "An external counterparty lent us money",
  },
  {
    value: "OTHER",
    labelAr: "أخرى",
    labelEn: "Other",
    impliedDirection: "UNCONSTRAINED",
    descriptionAr: "سبب آخر — يرجى تقديم تفصيل",
    descriptionEn: "Other — please provide details",
  },
]

type EmployeeOption = { id: string; name: string; phone: string; roleKey: string }

type ReasonCategory = "INVOICE_DRIVEN" | "SALARY_ADVANCE" | "REIMBURSEMENT" | "CASH_TAKE" | "EQUIPMENT_DAMAGE" | "PERSONAL_LOAN" | "DIRECT_LOAN_GIVEN" | "DIRECT_LOAN_TAKEN" | "OTHER"

/** Debt entry creation page. */
/**
 * @description Component
 */
export function DebtCreatePage({
  employees,
  externalCounterparties,
  navigation,
  preselectedPartyType,
  preselectedExternalCounterpartyId,
  preselectedWorkerId,
}: {
  employees: EmployeeOption[]
  externalCounterparties: ExternalCounterparty[]
  navigation: ReturnType<typeof useHomeViewNavigation>
  preselectedPartyType?: string
  preselectedExternalCounterpartyId?: string
  preselectedWorkerId?: string
}) {
  const { t } = useTranslation()
  const createDebtAccountMutation = useCreateDebtAccountMutation()
  const createExternalMutation = useCreateExternalCounterpartyMutation()
  const createEmployeeMutation = useCreateEmployeesBatchMutation()

  // Form state
  const [partyType, setPartyType] = useState<"INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY">(
    (preselectedPartyType === "EXTERNAL_COUNTERPARTY" ? "EXTERNAL_COUNTERPARTY" : "INTERNAL_WORKER")
  )
  const [selectedPartyId, setSelectedPartyId] = useState(preselectedExternalCounterpartyId || preselectedWorkerId || "")
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>("SALARY_ADVANCE")
  const [reasonDetail, setReasonDetail] = useState("")
  const [direction, setDirection] = useState<"owed-to-us" | "owed-by-us">("owed-to-us")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())

  const selectedCategory = DEBT_CATEGORIES.find((c) => c.value === reasonCategory)
  const isCategoryDirectionLocked = selectedCategory?.impliedDirection !== "UNCONSTRAINED"

  // When category locks direction, sync the direction state
  const resolvedDirection = useMemo(() => {
    if (!selectedCategory) return direction
    if (selectedCategory.impliedDirection === "PAYABLE") return "owed-by-us"
    if (selectedCategory.impliedDirection === "RECEIVABLE") return "owed-to-us"
    return direction
  }, [selectedCategory, direction])

  // Update direction when category changes
  if (isCategoryDirectionLocked) {
    const implied = selectedCategory!.impliedDirection === "PAYABLE" ? "owed-by-us" : "owed-to-us"
    if (direction !== implied) {
      setDirection(implied)
    }
  }

  const needsReasonDetail = reasonCategory === "OTHER"
  const hasValidReasonDetail = !needsReasonDetail || reasonDetail.trim().length > 0

  const normalizedAmount = amount.trim()
  const amountValue = normalizedAmount.length > 0 ? Number(normalizedAmount) : 0
  const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0
  const directionLabel = resolvedDirection === "owed-to-us" ? t("detailPages.debt.direction.owedToUs") : t("detailPages.debt.direction.owedByUs")

  const handleCreateDebt = async () => {
    if (!selectedPartyId || !hasValidAmount || !hasValidReasonDetail) return

    const signedAmount = resolvedDirection === "owed-to-us" ? amountValue : -amountValue

    await createDebtAccountMutation.mutateAsync({
      partyType,
      workerId: partyType === "INTERNAL_WORKER" ? selectedPartyId : null,
      externalCounterpartyId: partyType === "EXTERNAL_COUNTERPARTY" ? selectedPartyId : null,
      note: note.trim() || null,
      openingBalanceDzd: signedAmount,
      openingEntryDate: createDate ? toAlgeriaDayBoundaryIso(createDate, "start") : undefined,
      openingEntryNote: note.trim() || null,
      reasonCategory,
      reasonDetail: reasonDetail.trim() || null,
    })

    if (partyType === "INTERNAL_WORKER") {
      navigation.goToEmployeeDebts(selectedPartyId)
    } else {
      navigation.goToExternalDetails(selectedPartyId)
    }
  }

  return (
    <RecordPageFrame
      backHref="/debts"
      backLabel={t("common.back")}
      title={t("detailPages.debt.createTitle")}
    >
      <Surface className="p-5 md:p-6" variant="card">
        <div className="space-y-5">
          {/* Party Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t("detailPages.debt.partyType.label")}</label>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                className={cn(
                  "rounded-xl border p-4 text-center transition-all",
                  partyType === "INTERNAL_WORKER"
                    ? "border-primary/35 bg-primary/8"
                    : "border-border/60 hover:border-primary/20 hover:bg-muted/40",
                )}
                type="button"
                onClick={() => {
                  setPartyType("INTERNAL_WORKER")
                  setSelectedPartyId("")
                }}
              >
                <p className="font-semibold text-foreground">{t("detailPages.debt.partyType.internal")}</p>
              </button>
              <button
                className={cn(
                  "rounded-xl border p-4 text-center transition-all",
                  partyType === "EXTERNAL_COUNTERPARTY"
                    ? "border-primary/35 bg-primary/8"
                    : "border-border/60 hover:border-primary/20 hover:bg-muted/40",
                )}
                type="button"
                onClick={() => {
                  setPartyType("EXTERNAL_COUNTERPARTY")
                  setSelectedPartyId("")
                }}
              >
                <p className="font-semibold text-foreground">{t("detailPages.debt.partyType.external")}</p>
              </button>
            </div>
          </div>

          {/* Party Selection */}
          <Field label={t("detailPages.debt.partySelect")}>
            <CreateableSelect
              value={selectedPartyId}
              onChange={setSelectedPartyId}
              options={
                partyType === "INTERNAL_WORKER"
                  ? employees.map((p) => ({ id: p.id, name: `${p.name} (${p.phone})` }))
                  : externalCounterparties.map((p) => ({ id: p.id, name: p.fullName }))
              }
              emptyLabel={t("detailPages.debt.partySelect")}
              createLabel={partyType === "INTERNAL_WORKER" ? t("detailPages.debt.createEmployee") : t("detailPages.debt.createExternal")}
              createFields={
                partyType === "INTERNAL_WORKER"
                  ? [
                      { key: "firstName", label: t("detailPages.debt.employeeFields.firstName"), placeholder: t("detailPages.debt.employeeFields.firstNamePlaceholder"), required: true },
                      { key: "lastName", label: t("detailPages.debt.employeeFields.lastName"), placeholder: t("detailPages.debt.employeeFields.lastNamePlaceholder"), required: true },
                      { key: "phone", label: t("detailPages.debt.employeeFields.phone"), placeholder: t("detailPages.debt.employeeFields.phonePlaceholder") },
                    ]
                  : [
                      { key: "fullName", label: t("detailPages.debt.externalFields.fullName"), placeholder: t("detailPages.debt.externalFields.fullNamePlaceholder"), required: true },
                      { key: "phone", label: t("detailPages.debt.externalFields.phone"), placeholder: t("detailPages.debt.externalFields.phonePlaceholder") },
                    ]
              }
              onCreate={async (data) => {
                if (partyType === "INTERNAL_WORKER") {
                  const result = await createEmployeeMutation.mutateAsync({
                    employees: [{
                      firstName: data.firstName ?? "",
                      lastName: data.lastName ?? "",
                      phone: data.phone || "",
                      roleId: "",
                      status: "ACTIVE",
                      managerId: null,
                      salaryAmountDzd: null,
                      salaryPeriod: null,
                      notes: null,
                    }],
                  })
                  return result.createdCount > 0
                    ? { id: "new", name: `${data.firstName} ${data.lastName}` }
                    : { id: "", name: "" }
                } else {
                  const result = await createExternalMutation.mutateAsync({
                    fullName: data.fullName ?? "",
                    phoneNumber: data.phone || "",
                    note: null,
                  })
                  return { id: result.item.id, name: data.fullName ?? "" }
                }
              }}
            />
          </Field>

          {/* Reason Category */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {t("detailPages.debt.reasonCategory")}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {DEBT_CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  className={cn(
                    "rounded-xl border p-4 text-start transition-all",
                    reasonCategory === category.value
                      ? "border-primary/35 bg-primary/8"
                      : "border-border/60 hover:border-primary/20 hover:bg-muted/40",
                  )}
                  type="button"
                  onClick={() => setReasonCategory(category.value)}
                >
                  <p className="font-semibold text-foreground">{category.labelAr}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{category.descriptionAr}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Direction indicator */}
          <div
            className={cn(
              "rounded-xl border p-4 text-center",
              resolvedDirection === "owed-to-us"
                ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                : "border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20",
            )}
          >
            <p
              className={cn(
                "text-lg font-semibold",
                resolvedDirection === "owed-to-us"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-300",
              )}
            >
              {directionLabel}
            </p>
            {isCategoryDirectionLocked ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("detailPages.debt.directionDerived")}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("detailPages.debt.chooseDirection")}
              </p>
            )}
            {!isCategoryDirectionLocked ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <button
                  className={cn(
                    "rounded-xl border p-3 transition-all",
                    direction === "owed-to-us"
                      ? "border-emerald-500/30 bg-primary/8"
                      : "border-border/60 hover:bg-muted/40",
                  )}
                  type="button"
                  onClick={() => setDirection("owed-to-us")}
                >
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {t("detailPages.debt.direction.owedToUs")}
                  </p>
                </button>
                <button
                  className={cn(
                    "rounded-xl border p-3 transition-all",
                    direction === "owed-by-us"
                      ? "border-rose-500/30 bg-primary/8"
                      : "border-border/60 hover:bg-muted/40",
                  )}
                  type="button"
                  onClick={() => setDirection("owed-by-us")}
                >
                  <p className="font-semibold text-rose-700 dark:text-rose-300">
                    {t("detailPages.debt.direction.owedByUs")}
                  </p>
                </button>
              </div>
            ) : null}
          </div>

          {/* Reason Detail (required for OTHER) */}
          {needsReasonDetail ? (
            <Field label={t("detailPages.debt.reasonDetail")}>
              <Textarea
                placeholder={t("detailPages.debt.reasonDetailPlaceholder")}
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
              />
            </Field>
          ) : null}

          {/* Amount & Date */}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("detailPages.debt.amount")}>
              <CurrencyInput
                placeholder={t("detailPages.debt.zeroPlaceholder")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            <Field label={t("detailPages.debt.createDate")}>
              <DatePicker value={createDate} onChange={setCreateDate} />
            </Field>
          </div>

          {/* Note */}
          <Field label={t("detailPages.debt.note")}>
            <Textarea
              placeholder={t("detailPages.debt.caseLabelPlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line" dir="rtl">
            <Button
              disabled={!selectedPartyId || !hasValidAmount || !hasValidReasonDetail || createDebtAccountMutation.isPending}
              onClick={handleCreateDebt}
            >
              {createDebtAccountMutation.isPending ? t("common.saving") : t("detailPages.debt.createButton")}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigation.goToDebts()}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </Surface>
    </RecordPageFrame>
  )
}
