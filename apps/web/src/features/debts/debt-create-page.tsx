import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { useCreateDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"
import type { HomeViewNavigation } from "@/features/app-shell/home-view-navigation"
import type { ExternalCounterparty } from "@tuari/contracts"

type EmployeeOption = { id: string; name: string; phone: string; roleKey: string }

const STEP_PARTY_TYPE = 1
const STEP_PARTY_SELECT = 2
const STEP_AMOUNT = 3
const STEP_NOTE = 4

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
  navigation: HomeViewNavigation
  preselectedPartyType?: string
  preselectedExternalCounterpartyId?: string
  preselectedWorkerId?: string
}) {
  const { t } = useTranslation()
  const createDebtAccountMutation = useCreateDebtAccountMutation()
  const [step, setStep] = useState(() => {
    if (preselectedPartyType) return STEP_AMOUNT
    return STEP_PARTY_TYPE
  })
  const [partyType, setPartyType] = useState<"INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY" | null>(() => {
    if (preselectedPartyType === "INTERNAL_WORKER") return "INTERNAL_WORKER"
    if (preselectedPartyType === "EXTERNAL_COUNTERPARTY") return "EXTERNAL_COUNTERPARTY"
    return null
  })
  const [selectedPartyId, setSelectedPartyId] = useState(preselectedExternalCounterpartyId || preselectedWorkerId || "")
  const [direction, setDirection] = useState<"owed-to-us" | "owed-by-us">("owed-to-us")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())

  const selectedParty = useMemo(() => {
    if (partyType === "INTERNAL_WORKER") {
      return employees.find((e) => e.id === selectedPartyId)
    }
    return externalCounterparties.find((e) => e.id === selectedPartyId)
  }, [partyType, selectedPartyId, employees, externalCounterparties])

  const normalizedAmount = amount.trim()
  const amountValue = normalizedAmount.length > 0 ? Number(normalizedAmount) : 0
  const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0

  const handleCreateDebt = async () => {
    if (!partyType || !selectedPartyId || !hasValidAmount) return

    const signedAmount = direction === "owed-to-us" ? amountValue : -amountValue

    const result = await createDebtAccountMutation.mutateAsync({
      partyType,
      workerId: partyType === "INTERNAL_WORKER" ? selectedPartyId : null,
      externalCounterpartyId: partyType === "EXTERNAL_COUNTERPARTY" ? selectedPartyId : null,
      note: note.trim() || null,
      openingBalanceDzd: signedAmount,
      openingEntryDate: createDate ? toAlgeriaDayBoundaryIso(createDate, "start") : undefined,
      openingEntryNote: note.trim() || null,
    })

    // Navigate to the debt view
    if (partyType === "INTERNAL_WORKER") {
      navigation.goToEmployeeDebts(selectedPartyId)
    } else {
      navigation.goToExternalPersonDetails(selectedPartyId)
    }
  }

  return (
    <RecordPageFrame backHref="/debts" backLabel={t("common.back")} title={t("detailPages.debt.createTitle")}>
      {step === STEP_PARTY_TYPE && (
        <div className="space-y-5">
          <Surface className="p-5" variant="card">
            <SurfaceHeader description={t("detailPages.debt.createTypeDescription")} title={t("detailPages.debt.partyType.label")} />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button
                className={cn(
                  "rounded-[22px] border p-6 text-center transition-all",
                  partyType === "INTERNAL_WORKER"
                    ? "border-primary/35 bg-primary/8"
                    : "border-border/60 hover:border-primary/20 hover:bg-muted/40",
                )}
                type="button"
                onClick={() => {
                  setPartyType("INTERNAL_WORKER")
                  setStep(STEP_PARTY_SELECT)
                }}
              >
                <p className="text-lg font-semibold text-foreground">{t("detailPages.debt.partyType.internal")}</p>
              </button>
              <button
                className={cn(
                  "rounded-[22px] border p-6 text-center transition-all",
                  partyType === "EXTERNAL_COUNTERPARTY"
                    ? "border-primary/35 bg-primary/8"
                    : "border-border/60 hover:border-primary/20 hover:bg-muted/40",
                )}
                type="button"
                onClick={() => {
                  setPartyType("EXTERNAL_COUNTERPARTY")
                  setStep(STEP_PARTY_SELECT)
                }}
              >
                <p className="text-lg font-semibold text-foreground">{t("detailPages.debt.partyType.external")}</p>
              </button>
            </div>
          </Surface>
        </div>
      )}

      {step === STEP_PARTY_SELECT && partyType && (
        <div className="space-y-5">
          <Surface className="p-5" variant="card">
            <SurfaceHeader description={t("detailPages.debt.selectParty")} title={t("detailPages.debt.partySelect")} />
            <div className="mt-5 space-y-3">
              {partyType === "INTERNAL_WORKER"
                ? employees.map((emp) => (
                    <button
                      key={emp.id}
                      className={cn(
                        "w-full rounded-[22px] border p-4 text-end transition-colors",
                        selectedPartyId === emp.id ? "border-primary/35 bg-primary/8" : "border-border/60 hover:bg-muted/40",
                      )}
                      type="button"
                      onClick={() => {
                        setSelectedPartyId(emp.id)
                        setStep(STEP_AMOUNT)
                      }}
                    >
                      <p className="font-semibold text-foreground">{emp.name}</p>
                      <p className="text-sm text-muted-foreground">{emp.phone}</p>
                    </button>
                  ))
                : externalCounterparties.map((cp) => (
                    <button
                      key={cp.id}
                      className={cn(
                        "w-full rounded-[22px] border p-4 text-end transition-colors",
                        selectedPartyId === cp.id ? "border-primary/35 bg-primary/8" : "border-border/60 hover:bg-muted/40",
                      )}
                      type="button"
                      onClick={() => {
                        setSelectedPartyId(cp.id)
                        setStep(STEP_AMOUNT)
                      }}
                    >
                      <p className="font-semibold text-foreground">{cp.fullName}</p>
                      <p className="text-sm text-muted-foreground">{cp.phoneNumber}</p>
                    </button>
                  ))}
              {partyType === "EXTERNAL_COUNTERPARTY" && (
                <button
                  className="w-full rounded-[22px] border border-dashed border-border/60 p-4 text-center transition-colors hover:bg-muted/40"
                  type="button"
                  onClick={() => navigation.goToExternalPersonCreate("debt-create")}
                >
                  <p className="font-semibold text-primary">+ {t("detailPages.debt.createNewPerson")}</p>
                </button>
              )}
            </div>
            <PageFooterActions className="mt-4">
              <Button variant="outline" onClick={() => setStep(STEP_PARTY_TYPE)}>
                {t("common.back")}
              </Button>
            </PageFooterActions>
          </Surface>
        </div>
      )}

      {step === STEP_AMOUNT && partyType && selectedPartyId && (
        <div className="space-y-5">
          <Surface className="p-5" variant="card">
            <SurfaceHeader
              description={selectedParty ? ("name" in selectedParty ? selectedParty.name : selectedParty.fullName) : ""}
              title={t("detailPages.debt.amountDirection")}
            />
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  className={cn(
                    "rounded-[22px] border p-4 transition-all",
                    direction === "owed-to-us" ? "border-primary/35 bg-primary/8" : "border-border/60 hover:bg-muted/40",
                  )}
                  type="button"
                  onClick={() => setDirection("owed-to-us")}
                >
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">{t("detailPages.debt.direction.owedToUs")}</p>
                </button>
                <button
                  className={cn(
                    "rounded-[22px] border p-4 transition-all",
                    direction === "owed-by-us" ? "border-primary/35 bg-primary/8" : "border-border/60 hover:bg-muted/40",
                  )}
                  type="button"
                  onClick={() => setDirection("owed-by-us")}
                >
                  <p className="font-semibold text-rose-700 dark:text-rose-300">{t("detailPages.debt.direction.owedByUs")}</p>
                </button>
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t("detailPages.debt.amount")}</span>
                <CurrencyInput
                  placeholder={t("detailPages.debt.zeroPlaceholder")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t("detailPages.debt.createDate")}</span>
                <input
                  className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                />
              </label>
            </div>
            <PageFooterActions className="mt-4">
              <Button variant="outline" onClick={() => setStep(STEP_PARTY_SELECT)}>
                {t("common.back")}
              </Button>
              <Button disabled={!hasValidAmount} onClick={() => setStep(STEP_NOTE)}>
                {t("common.next")}
              </Button>
            </PageFooterActions>
          </Surface>
        </div>
      )}

      {step === STEP_NOTE && partyType && selectedPartyId && (
        <div className="space-y-5">
          <Surface className="p-5" variant="card">
            <SurfaceHeader description={t("detailPages.debt.noteDescription")} title={t("detailPages.debt.note")} />
            <div className="mt-5">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t("detailPages.debt.caseLabel")}</span>
                <Textarea placeholder={t("detailPages.debt.caseLabelPlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <PageFooterActions className="mt-4">
              <Button variant="outline" onClick={() => setStep(STEP_AMOUNT)}>
                {t("common.back")}
              </Button>
              <Button disabled={createDebtAccountMutation.isPending} onClick={handleCreateDebt}>
                {createDebtAccountMutation.isPending ? t("common.saving") : t("detailPages.debt.create")}
              </Button>
            </PageFooterActions>
          </Surface>
        </div>
      )}
    </RecordPageFrame>
  )
}
