import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { CreateableSelect } from "@/components/ui/createable-select"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { Field } from "@/components/ui/field"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { Surface } from "@/features/shared/page-primitives"
import { useCreateDebtAccountMutation, useCreateExternalCounterpartyMutation } from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { debtDirectionFromAlias, type DebtDirectionAlias } from "./debt-utils"
import { cn } from "@/lib/utils"
import type { useHomeViewNavigation } from "@/features/app-shell/home-view-navigation"
import { getLockedDirectionForCategory, type ExternalCounterparty } from "@tuari/contracts"

/**
 * Reason category → direction mapping.
 * Categories that lock direction show a fixed label;
 * OTHER and INVOICE_DRIVEN require the caller to choose.
 */
const DEBT_CATEGORIES: Array<{
  value: ReasonCategory
  labelKey: string
  descriptionKey: string
}> = [
  {
    value: "SALARY_ADVANCE",
    labelKey: "detailPages.debt.categories.salaryAdvance.label",
    descriptionKey: "detailPages.debt.categories.salaryAdvance.description",
  },
  {
    value: "REIMBURSEMENT",
    labelKey: "detailPages.debt.categories.reimbursement.label",
    descriptionKey: "detailPages.debt.categories.reimbursement.description",
  },
  {
    value: "CASH_TAKE",
    labelKey: "detailPages.debt.categories.cashTake.label",
    descriptionKey: "detailPages.debt.categories.cashTake.description",
  },
  {
    value: "EQUIPMENT_DAMAGE",
    labelKey: "detailPages.debt.categories.equipmentDamage.label",
    descriptionKey: "detailPages.debt.categories.equipmentDamage.description",
  },
  {
    value: "PERSONAL_LOAN",
    labelKey: "detailPages.debt.categories.personalLoan.label",
    descriptionKey: "detailPages.debt.categories.personalLoan.description",
  },
  {
    value: "DIRECT_LOAN_GIVEN",
    labelKey: "detailPages.debt.categories.directLoanGiven.label",
    descriptionKey: "detailPages.debt.categories.directLoanGiven.description",
  },
  {
    value: "DIRECT_LOAN_TAKEN",
    labelKey: "detailPages.debt.categories.directLoanTaken.label",
    descriptionKey: "detailPages.debt.categories.directLoanTaken.description",
  },
  {
    value: "OTHER",
    labelKey: "detailPages.debt.categories.other.label",
    descriptionKey: "detailPages.debt.categories.other.description",
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

  // Form state
  const [partyType, setPartyType] = useState<"INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY">(
    (preselectedPartyType === "EXTERNAL_COUNTERPARTY" ? "EXTERNAL_COUNTERPARTY" : "INTERNAL_WORKER")
  )
  const [selectedPartyId, setSelectedPartyId] = useState(preselectedExternalCounterpartyId || preselectedWorkerId || "")
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>("SALARY_ADVANCE")
  const [reasonDetail, setReasonDetail] = useState("")
  const [direction, setDirection] = useState<DebtDirectionAlias>("owed-to-us")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())

  const selectedCategory = DEBT_CATEGORIES.find((c) => c.value === reasonCategory)
  // One derivation: the category's locked direction comes from the contracts
  // helper, never a second hand-copied map. `null` means unconstrained (OTHER).
  const impliedDirection = selectedCategory
    ? getLockedDirectionForCategory(selectedCategory.value)
    : null
  const isCategoryDirectionLocked = impliedDirection !== null

  // When category locks direction, sync the direction state
  const resolvedDirection = useMemo(() => {
    if (impliedDirection === "PAYABLE") return "owed-by-us"
    if (impliedDirection === "RECEIVABLE") return "owed-to-us"
    return direction
  }, [impliedDirection, direction])

  // Update direction when category changes
  if (isCategoryDirectionLocked) {
    const implied = impliedDirection === "PAYABLE" ? "owed-by-us" : "owed-to-us"
    if (direction !== implied) {
      setDirection(implied)
    }
  }

  const needsReasonDetail = reasonCategory === "OTHER"
  const hasValidReasonDetail = !needsReasonDetail || reasonDetail.trim().length > 0

  const normalizedAmount = amount.trim()
  const amountValue = normalizedAmount.length > 0 ? Number(normalizedAmount) : 0
  const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0
  const accountDirection = debtDirectionFromAlias(resolvedDirection)
  const directionLabel = accountDirection === "RECEIVABLE" ? t("detailPages.debt.direction.owedToUs") : t("detailPages.debt.direction.owedByUs")

  const handleCreateDebt = async () => {
    if (!selectedPartyId || !hasValidAmount || !hasValidReasonDetail) return

    // The direction carries the meaning; the opening amount is always positive
    // (a signed balance is never stored or shown). The direction is required by
    // the contract, so it is always sent with the opening.
    await createDebtAccountMutation.mutateAsync({
      partyType,
      workerId: partyType === "INTERNAL_WORKER" ? selectedPartyId : null,
      externalCounterpartyId: partyType === "EXTERNAL_COUNTERPARTY" ? selectedPartyId : null,
      direction: accountDirection,
      note: note.trim() || null,
      openingBalanceDzd: amountValue,
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
            {/*
             * Inline create is offered for external counterparties only. The
             * internal-worker create could never succeed: the API rejects an
             * ACTIVE worker that has no project and no direct manager, and this
             * text-only dialog cannot collect either. Creating a worker belongs
             * in the employees form, which collects the workplace.
             */}
            <CreateableSelect
              value={selectedPartyId}
              onChange={setSelectedPartyId}
              options={
                partyType === "INTERNAL_WORKER"
                  ? employees.map((p) => ({ id: p.id, name: `${p.name} (${p.phone})` }))
                  : externalCounterparties.map((p) => ({ id: p.id, name: p.fullName }))
              }
              emptyLabel={t("detailPages.debt.partySelect")}
              createLabel={partyType === "EXTERNAL_COUNTERPARTY" ? t("detailPages.debt.createExternal") : undefined}
              createFields={
                partyType === "EXTERNAL_COUNTERPARTY"
                  ? [
                      { key: "fullName", label: t("detailPages.debt.externalFields.fullName"), placeholder: t("detailPages.debt.externalFields.fullNamePlaceholder"), required: true },
                      { key: "phone", label: t("detailPages.debt.externalFields.phone"), placeholder: t("detailPages.debt.externalFields.phonePlaceholder"), required: true },
                    ]
                  : undefined
              }
              onCreate={partyType === "EXTERNAL_COUNTERPARTY" ? async (data) => {
                const result = await createExternalMutation.mutateAsync({
                  fullName: data.fullName ?? "",
                  phoneNumber: data.phone || "",
                  note: null,
                })
                return { id: result.item.id, name: data.fullName ?? "" }
              } : undefined}
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
                  <p className="font-semibold text-foreground">{t(category.labelKey)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(category.descriptionKey)}</p>
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
